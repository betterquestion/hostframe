use std::{
    ptr, thread,
    time::{Duration, Instant},
};

use napi::{Env, Error, JsValue, Result, Status, bindgen_prelude::Unknown};
use napi_derive::napi;

use crate::{dawn::*, window::Window};

#[napi(object)]
pub struct SurfaceOptions {
    pub format: String,
    pub usage: u32,
    pub alpha_mode: String,
    pub view_formats: Vec<String>,
}

struct Configuration {
    device: WGPUDevice,
    format: WGPUTextureFormat,
    usage: WGPUTextureUsage,
    alpha_mode: WGPUCompositeAlphaMode,
    present_mode: WGPUPresentMode,
    view_formats: Vec<WGPUTextureFormat>,
    max_dimension: u32,
}

pub struct Surface {
    bridge: Bridge,
    instance: WGPUInstance,
    source: WGPUSurfaceSourceXlibWindow,
    surface: WGPUSurface,
    configuration: Option<Configuration>,
    size: Option<(u32, u32)>,
    frame: WGPUTexture,
    refresh_pending: bool,
    needs_cleanup: bool,
    vsync: bool,
}
impl Surface {
    pub fn open(
        bridge: Bridge,
        env: Env,
        gpu: Unknown,
        window: &Window,
        vsync: bool,
    ) -> Result<Self> {
        let api = bridge.api();
        let instance = unsafe { api.acquire_instance.unwrap()(env.raw().cast(), gpu.raw().cast()) };
        if instance.is_null() {
            return Err(Error::from_reason("Expected a Dawn GPU"));
        }

        let source = WGPUSurfaceSourceXlibWindow {
            chain: WGPUChainedStruct {
                next: ptr::null_mut(),
                sType: WGPUSType_WGPUSType_SurfaceSourceXlibWindow,
            },
            display: window.glfw.get_x11_display(),
            window: window.handle.get_x11_window() as u64,
        };
        let mut state = Self {
            bridge,
            instance,
            source,
            surface: ptr::null_mut(),
            configuration: None,
            size: None,
            frame: ptr::null_mut(),
            refresh_pending: false,
            needs_cleanup: false,
            vsync,
        };
        state.recreate()?;
        Ok(state)
    }

    fn recreate(&mut self) -> Result<()> {
        let descriptor = WGPUSurfaceDescriptor {
            nextInChain: &mut self.source.chain,
            label: WGPUStringView {
                data: ptr::null(),
                length: usize::MAX,
            },
        };
        let surface =
            unsafe { self.bridge.api().create_surface.unwrap()(self.instance, &descriptor) };
        if surface.is_null() {
            return Err(Error::from_reason("Dawn surface creation failed"));
        }
        self.release_surface();
        self.surface = surface;
        Ok(())
    }

    pub fn request_adapter<'env>(
        &self,
        env: Env,
        gpu: Unknown<'env>,
        options: Option<Unknown<'env>>,
    ) -> Result<Unknown<'env>> {
        let api = self.bridge.api();
        let instance = unsafe { api.acquire_instance.unwrap()(env.raw().cast(), gpu.raw().cast()) };
        if !instance.is_null() {
            unsafe { api.release_instance.unwrap()(instance) };
        }
        if instance != self.instance {
            return Err(Error::from_reason(
                "GPU must belong to the surface instance",
            ));
        }
        let mut value = ptr::null_mut();
        let options = options
            .as_ref()
            .map_or(ptr::null_mut(), |options| options.raw().cast());
        let status = unsafe {
            api.request_surface_adapter.unwrap()(
                env.raw().cast(),
                gpu.raw().cast(),
                self.surface,
                options,
                &mut value,
            )
        };
        value_from_bridge(env, status, value, "Could not request a surface adapter")
    }

    pub fn configured(&self) -> bool {
        self.configuration.is_some()
    }

    pub fn configure(
        &mut self,
        env: Env,
        value: Unknown,
        options: SurfaceOptions,
        read_max_dimension: &dyn Fn() -> Result<u32>,
        destroy_device: &dyn Fn() -> Result<()>,
    ) -> Result<&'static str> {
        if self.surface.is_null() {
            self.recreate()?;
        }
        let format = texture_format(&options.format)?;
        let view_formats = options
            .view_formats
            .iter()
            .map(|format| texture_format(format))
            .collect::<Result<Vec<_>>>()?;
        if view_formats
            .iter()
            .any(|&view| base_format(view) != base_format(format))
        {
            return Err(Error::new(
                Status::InvalidArg,
                "Incompatible surface viewFormat",
            ));
        }
        let alpha_mode = match options.alpha_mode.as_str() {
            "opaque" => WGPUCompositeAlphaMode_WGPUCompositeAlphaMode_Opaque,
            "premultiplied" => WGPUCompositeAlphaMode_WGPUCompositeAlphaMode_Premultiplied,
            _ => return Err(Error::new(Status::InvalidArg, "Unsupported alphaMode")),
        };
        let usage = WGPUTextureUsage::from(options.usage);
        let api = self.bridge.api();
        let device = unsafe { api.acquire_device.unwrap()(env.raw().cast(), value.raw().cast()) };
        if device.is_null() {
            return Err(Error::new(Status::InvalidArg, "Expected a Dawn GPUDevice"));
        }
        let release_device = api.release_device.unwrap();
        let (present_mode, max_dimension) = match self
            .check_configuration(device, format, usage, alpha_mode)
            .and_then(|mode| {
                let max_dimension = read_max_dimension()?;
                self.unconfigure(Some(destroy_device))?;
                Ok((mode, max_dimension))
            }) {
            Ok(mode) => mode,
            Err(error) => {
                unsafe { release_device(device) };
                return Err(error);
            }
        };
        self.configuration = Some(Configuration {
            device,
            format,
            usage,
            alpha_mode,
            present_mode,
            view_formats,
            max_dimension,
        });
        use self::{
            WGPUPresentMode_WGPUPresentMode_Immediate as IMMEDIATE,
            WGPUPresentMode_WGPUPresentMode_Mailbox as MAILBOX,
        };
        Ok(match present_mode {
            IMMEDIATE => "immediate",
            MAILBOX => "mailbox",
            _ => "fifo",
        })
    }

    fn check_configuration(
        &self,
        device: WGPUDevice,
        format: WGPUTextureFormat,
        usage: WGPUTextureUsage,
        alpha: WGPUCompositeAlphaMode,
    ) -> Result<WGPUPresentMode> {
        self.bridge.check_device(self.instance, device)?;
        let api = self.bridge.api();
        let adapter = unsafe { api.device_get_adapter.unwrap()(device) };
        if adapter.is_null() {
            return Err(Error::from_reason("Could not get the Dawn device adapter"));
        }
        let mut capabilities: WGPUSurfaceCapabilities = unsafe { std::mem::zeroed() };
        let status = unsafe {
            let status =
                api.surface_get_capabilities.unwrap()(self.surface, adapter, &mut capabilities);
            api.release_adapter.unwrap()(adapter);
            status
        };
        if status != WGPUStatus_WGPUStatus_Success {
            return Err(Error::from_reason(
                "Device adapter cannot present to this window",
            ));
        }
        let result = check_capabilities(&capabilities, format, usage, alpha, self.vsync);
        unsafe { api.surface_capabilities_free_members.unwrap()(capabilities) };
        result
    }

    pub fn acquire<'env>(
        &mut self,
        env: Env,
        device: Unknown<'env>,
        size: Option<(u32, u32)>,
    ) -> Result<Option<Unknown<'env>>> {
        use self::{
            WGPUSurfaceGetCurrentTextureStatus_WGPUSurfaceGetCurrentTextureStatus_Lost as LOST,
            WGPUSurfaceGetCurrentTextureStatus_WGPUSurfaceGetCurrentTextureStatus_Outdated as OUTDATED,
            WGPUSurfaceGetCurrentTextureStatus_WGPUSurfaceGetCurrentTextureStatus_SuccessOptimal as OPTIMAL,
            WGPUSurfaceGetCurrentTextureStatus_WGPUSurfaceGetCurrentTextureStatus_SuccessSuboptimal as SUBOPTIMAL,
            WGPUSurfaceGetCurrentTextureStatus_WGPUSurfaceGetCurrentTextureStatus_Timeout as TIMEOUT,
        };
        if !self.frame.is_null() {
            return Err(Error::from_reason("A frame is already acquired"));
        }
        let configuration = self
            .configuration
            .as_ref()
            .ok_or_else(|| Error::from_reason("Configure the surface before rendering"))?;
        let configured_device = configuration.device;
        self.bridge.check_device(self.instance, configured_device)?;
        let Some(size) = size else {
            self.deactivate();
            return Ok(None);
        };
        let api = self.bridge.api();
        let acquired =
            unsafe { api.acquire_device.unwrap()(env.raw().cast(), device.raw().cast()) };
        if !acquired.is_null() {
            unsafe { api.release_device.unwrap()(acquired) };
        }
        if acquired != configured_device {
            return Err(Error::from_reason(
                "The supplied GPUDevice is not configured on this surface",
            ));
        }
        let mut texture: WGPUSurfaceTexture;
        let mut retry = true;
        loop {
            let configuration = self.configuration.as_ref().unwrap();
            let api = self.bridge.api();
            if size.0 > configuration.max_dimension || size.1 > configuration.max_dimension {
                self.deactivate();
                return Err(Error::from_reason(
                    "Window framebuffer exceeds device maxTextureDimension2D",
                ));
            }
            if self.size != Some(size) || self.refresh_pending {
                if self.size.is_some() {
                    unsafe { api.surface_unconfigure.unwrap()(self.surface) };
                }
                self.refresh_pending = false;
                let descriptor = WGPUSurfaceConfiguration {
                    nextInChain: ptr::null_mut(),
                    device: configuration.device,
                    format: configuration.format,
                    usage: configuration.usage,
                    width: size.0,
                    height: size.1,
                    viewFormatCount: configuration.view_formats.len(),
                    viewFormats: configuration.view_formats.as_ptr(),
                    alphaMode: configuration.alpha_mode,
                    presentMode: configuration.present_mode,
                };
                unsafe { api.surface_configure.unwrap()(self.surface, &descriptor) };
                self.size = Some(size);
                self.needs_cleanup = true;
            }

            texture = unsafe { std::mem::zeroed() };
            unsafe { api.surface_get_current_texture.unwrap()(self.surface, &mut texture) };
            self.frame = texture.texture;
            if let Err(error) = self.bridge.check_device(self.instance, configured_device) {
                self.discard_frame();
                return Err(error);
            }
            if !retry || !matches!(texture.status, OUTDATED | LOST) {
                break;
            }
            self.discard_frame();
            if texture.status == LOST {
                self.recreate()?;
            }
            retry = false;
        }
        let api = self.bridge.api();
        match texture.status {
            OPTIMAL | SUBOPTIMAL if !self.frame.is_null() => {
                self.refresh_pending = texture.status == SUBOPTIMAL;
                let mut value = ptr::null_mut();
                let status = unsafe {
                    api.wrap_surface_texture.unwrap()(
                        env.raw().cast(),
                        device.raw().cast(),
                        self.frame,
                        &mut value,
                    )
                };
                let result =
                    value_from_bridge(env, status, value, "Could not wrap the Dawn texture");
                if result.is_err() {
                    self.discard_frame();
                }
                result.map(Some)
            }
            TIMEOUT => {
                self.release_frame();
                Ok(None)
            }
            OUTDATED | LOST => {
                self.discard_frame();
                Ok(None)
            }
            status => {
                self.discard_frame();
                Err(Error::from_reason(format!(
                    "Dawn could not acquire a frame (status {status})"
                )))
            }
        }
    }

    pub fn present(&mut self) -> Result<()> {
        if self.frame.is_null() {
            return Err(Error::from_reason("Acquire a frame before presenting"));
        }
        let status = unsafe { self.bridge.api().surface_present.unwrap()(self.surface) };
        self.release_frame();
        if status != WGPUStatus_WGPUStatus_Success {
            self.deactivate();
            return Err(Error::from_reason("Dawn could not present the frame"));
        }
        Ok(())
    }

    pub fn discard_frame(&mut self) {
        self.release_frame();
        self.deactivate();
    }

    fn release_frame(&mut self) {
        if !self.frame.is_null() {
            unsafe { self.bridge.api().release_texture.unwrap()(self.frame) };
            self.frame = ptr::null_mut();
        }
    }

    pub fn deactivate(&mut self) {
        self.refresh_pending = false;
        if self.size.take().is_some() {
            unsafe { self.bridge.api().surface_unconfigure.unwrap()(self.surface) };
        }
    }

    fn release_surface(&mut self) {
        if !self.surface.is_null() {
            unsafe { self.bridge.api().release_surface.unwrap()(self.surface) };
            self.surface = ptr::null_mut();
        }
    }

    pub fn unconfigure(&mut self, destroy_device: Option<&dyn Fn() -> Result<()>>) -> Result<()> {
        if !self.configured() {
            return Ok(());
        }
        self.discard_frame();
        self.release_surface();
        let cleanup = self.drain(destroy_device);
        self.recreate()?;
        cleanup
    }

    fn drain(&mut self, destroy_device: Option<&dyn Fn() -> Result<()>>) -> Result<()> {
        let api = self.bridge.api();
        let mut timed_out = false;
        if let Some(configuration) = self.configuration.take() {
            let device = configuration.device;
            if std::mem::take(&mut self.needs_cleanup) {
                unsafe { api.submit_cleanup.unwrap()(self.instance, device) };
                let deadline = Instant::now() + Duration::from_secs(5);
                let force_timeout = force_cleanup_timeout();
                while unsafe { api.device_tick.unwrap()(device) } != 0 || force_timeout {
                    if force_timeout || Instant::now() >= deadline {
                        // Prefer Dawn's JavaScript binding, which also settles the
                        // wrapper's loss promise and marks it explicitly destroyed.
                        if !destroy_device.is_some_and(|destroy| destroy().is_ok()) {
                            unsafe { api.device_destroy.unwrap()(device) };
                        }
                        timed_out = true;
                        break;
                    }
                    thread::sleep(Duration::from_millis(1));
                }
            }
            unsafe { api.release_device.unwrap()(device) };
        }
        if timed_out {
            return Err(Error::from_reason(
                "GPU cleanup timed out; device was destroyed",
            ));
        }
        Ok(())
    }

    pub fn close(&mut self, destroy_device: Option<&dyn Fn() -> Result<()>>) -> Result<()> {
        self.discard_frame();
        self.release_surface();
        let cleanup = self.drain(destroy_device);
        if !self.instance.is_null() {
            unsafe { self.bridge.api().release_instance.unwrap()(self.instance) };
            self.instance = ptr::null_mut();
        }
        cleanup
    }
}

impl Drop for Surface {
    fn drop(&mut self) {
        let _ = self.close(None);
    }
}

fn check_capabilities(
    caps: &WGPUSurfaceCapabilities,
    format: WGPUTextureFormat,
    usage: WGPUTextureUsage,
    alpha: WGPUCompositeAlphaMode,
    vsync: bool,
) -> Result<WGPUPresentMode> {
    // Dawn owns these arrays until surface_capabilities_free_members runs.
    fn includes<T: PartialEq>(values: *const T, count: usize, value: T) -> bool {
        count > 0 && unsafe { std::slice::from_raw_parts(values, count) }.contains(&value)
    }
    if !includes(caps.formats, caps.formatCount, format) {
        return Err(Error::from_reason("Unsupported surface format"));
    }
    if !includes(caps.alphaModes, caps.alphaModeCount, alpha) {
        return Err(Error::from_reason("Unsupported surface alphaMode"));
    }
    if usage == 0 || (caps.usages & usage) != usage {
        return Err(Error::from_reason("Unsupported surface usage"));
    }
    let modes: &[WGPUPresentMode] = if vsync {
        &[WGPUPresentMode_WGPUPresentMode_Fifo]
    } else {
        &[
            WGPUPresentMode_WGPUPresentMode_Immediate,
            WGPUPresentMode_WGPUPresentMode_Mailbox,
        ]
    };
    modes
        .iter()
        .copied()
        .find(|mode| includes(caps.presentModes, caps.presentModeCount, *mode))
        .ok_or_else(|| Error::from_reason("Requested surface present mode is unsupported"))
}

fn texture_format(format: &str) -> Result<WGPUTextureFormat> {
    match format {
        "bgra8unorm" => Ok(WGPUTextureFormat_WGPUTextureFormat_BGRA8Unorm),
        "bgra8unorm-srgb" => Ok(WGPUTextureFormat_WGPUTextureFormat_BGRA8UnormSrgb),
        "rgba8unorm" => Ok(WGPUTextureFormat_WGPUTextureFormat_RGBA8Unorm),
        "rgba8unorm-srgb" => Ok(WGPUTextureFormat_WGPUTextureFormat_RGBA8UnormSrgb),
        "rgba16float" => Ok(WGPUTextureFormat_WGPUTextureFormat_RGBA16Float),
        "rgb10a2unorm" => Ok(WGPUTextureFormat_WGPUTextureFormat_RGB10A2Unorm),
        _ => Err(Error::from_reason("Unsupported surface format")),
    }
}

fn base_format(format: WGPUTextureFormat) -> WGPUTextureFormat {
    use self::{
        WGPUTextureFormat_WGPUTextureFormat_BGRA8UnormSrgb as BGRA_SRGB,
        WGPUTextureFormat_WGPUTextureFormat_RGBA8UnormSrgb as RGBA_SRGB,
    };
    match format {
        RGBA_SRGB => WGPUTextureFormat_WGPUTextureFormat_RGBA8Unorm,
        BGRA_SRGB => WGPUTextureFormat_WGPUTextureFormat_BGRA8Unorm,
        _ => format,
    }
}

#[cfg(feature = "test-cleanup-timeout")]
fn force_cleanup_timeout() -> bool {
    use std::sync::atomic::{AtomicBool, Ordering};
    static INJECTED: AtomicBool = AtomicBool::new(false);
    std::env::var_os("HOSTFRAME_TEST_STALL_CLEANUP").is_some()
        && !INJECTED.swap(true, Ordering::Relaxed)
}

#[cfg(not(feature = "test-cleanup-timeout"))]
fn force_cleanup_timeout() -> bool {
    false
}
