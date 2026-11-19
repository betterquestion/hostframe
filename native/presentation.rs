use std::{
    ptr, thread,
    time::{Duration, Instant},
};

use napi::{Env, Error, JsValue, Result, bindgen_prelude::Unknown};

use crate::{dawn::*, window::Window};

struct Configuration {
    device: WGPUDevice,
    format: WGPUTextureFormat,
}

pub struct Surface {
    bridge: Bridge,
    instance: WGPUInstance,
    surface: WGPUSurface,
    configuration: Option<Configuration>,
    size: Option<(u32, u32)>,
    frame: WGPUTexture,
    needs_cleanup: bool,
}

impl Surface {
    pub fn open(bridge: Bridge, env: Env, gpu: Unknown, window: &Window) -> Result<Self> {
        let api = bridge.api();
        let instance = unsafe { api.acquire_instance.unwrap()(env.raw().cast(), gpu.raw().cast()) };
        if instance.is_null() {
            return Err(Error::from_reason("Expected a Dawn GPU"));
        }

        let mut source = WGPUSurfaceSourceXlibWindow {
            chain: WGPUChainedStruct {
                next: ptr::null_mut(),
                sType: WGPUSType_WGPUSType_SurfaceSourceXlibWindow,
            },
            display: window.glfw.get_x11_display(),
            window: window.handle.get_x11_window() as u64,
        };
        let descriptor = WGPUSurfaceDescriptor {
            nextInChain: &mut source.chain,
            label: WGPUStringView {
                data: ptr::null(),
                length: usize::MAX,
            },
        };
        let surface = unsafe { api.create_surface.unwrap()(instance, &descriptor) };
        if surface.is_null() {
            unsafe { api.release_instance.unwrap()(instance) };
            return Err(Error::from_reason("Could not create the Dawn surface"));
        }

        Ok(Self {
            bridge,
            instance,
            surface,
            configuration: None,
            size: None,
            frame: ptr::null_mut(),
            needs_cleanup: false,
        })
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

    pub fn configure(&mut self, env: Env, device: Unknown, format: &str) -> Result<()> {
        use self::{
            WGPUTextureFormat_WGPUTextureFormat_BGRA8Unorm as BGRA8,
            WGPUTextureFormat_WGPUTextureFormat_BGRA8UnormSrgb as BGRA8_SRGB,
            WGPUTextureFormat_WGPUTextureFormat_RGBA8Unorm as RGBA8,
            WGPUTextureFormat_WGPUTextureFormat_RGBA8UnormSrgb as RGBA8_SRGB,
        };

        if !self.frame.is_null() {
            return Err(Error::from_reason(
                "Cannot configure during a render callback",
            ));
        }
        let format = match format {
            "bgra8unorm" => BGRA8,
            "bgra8unorm-srgb" => BGRA8_SRGB,
            "rgba8unorm" => RGBA8,
            "rgba8unorm-srgb" => RGBA8_SRGB,
            _ => return Err(Error::from_reason("Unsupported Hostframe surface format")),
        };
        let api = self.bridge.api();
        let device = unsafe { api.acquire_device.unwrap()(env.raw().cast(), device.raw().cast()) };
        if device.is_null() {
            return Err(Error::from_reason("Expected a Dawn GPUDevice"));
        }
        if let Err(error) = self.check_configuration(device, format) {
            unsafe { api.release_device.unwrap()(device) };
            return Err(error);
        }
        if let Some(previous) = self.configuration.replace(Configuration { device, format }) {
            unsafe { api.release_device.unwrap()(previous.device) };
        }
        self.unconfigure();
        Ok(())
    }

    fn check_configuration(&self, device: WGPUDevice, format: WGPUTextureFormat) -> Result<()> {
        if self
            .configuration
            .as_ref()
            .is_some_and(|current| current.device != device)
        {
            return Err(Error::from_reason(
                "The pilot supports one GPUDevice per window",
            ));
        }
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
        let supports_rendering = capabilities.usages & WGPUTextureUsage_RenderAttachment != 0;
        let supports_format = capabilities.formatCount > 0
            && unsafe {
                std::slice::from_raw_parts(capabilities.formats, capabilities.formatCount)
                    .contains(&format)
            };
        unsafe { api.surface_capabilities_free_members.unwrap()(capabilities) };
        if !supports_rendering || !supports_format {
            return Err(Error::from_reason(
                "Surface does not support rendering with the requested format",
            ));
        }
        Ok(())
    }

    pub fn acquire<'env>(
        &mut self,
        env: Env,
        device: Unknown<'env>,
        size: (u32, u32),
    ) -> Result<Option<Unknown<'env>>> {
        use self::{
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
        let api = self.bridge.api();
        let acquired =
            unsafe { api.acquire_device.unwrap()(env.raw().cast(), device.raw().cast()) };
        if !acquired.is_null() {
            unsafe { api.release_device.unwrap()(acquired) };
        }
        if acquired != configuration.device {
            return Err(Error::from_reason(
                "The supplied GPUDevice is not configured on this surface",
            ));
        }
        if self.size != Some(size) {
            let descriptor = WGPUSurfaceConfiguration {
                nextInChain: ptr::null_mut(),
                device: configuration.device,
                format: configuration.format,
                usage: WGPUTextureUsage_RenderAttachment,
                width: size.0,
                height: size.1,
                viewFormatCount: 0,
                viewFormats: ptr::null(),
                alphaMode: WGPUCompositeAlphaMode_WGPUCompositeAlphaMode_Auto,
                presentMode: WGPUPresentMode_WGPUPresentMode_Fifo,
            };
            unsafe { api.surface_configure.unwrap()(self.surface, &descriptor) };
            self.size = Some(size);
            self.needs_cleanup = true;
        }

        let mut texture: WGPUSurfaceTexture = unsafe { std::mem::zeroed() };
        unsafe { api.surface_get_current_texture.unwrap()(self.surface, &mut texture) };
        self.frame = texture.texture;
        match texture.status {
            OPTIMAL | SUBOPTIMAL if !self.frame.is_null() => {
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
            OUTDATED => {
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
            self.unconfigure();
            return Err(Error::from_reason("Dawn could not present the frame"));
        }
        Ok(())
    }

    pub fn discard_frame(&mut self) {
        self.release_frame();
        self.unconfigure();
    }

    fn release_frame(&mut self) {
        if !self.frame.is_null() {
            unsafe { self.bridge.api().release_texture.unwrap()(self.frame) };
            self.frame = ptr::null_mut();
        }
    }

    fn unconfigure(&mut self) {
        if self.size.take().is_some() {
            unsafe { self.bridge.api().surface_unconfigure.unwrap()(self.surface) };
        }
    }

    pub fn close(&mut self) -> Result<()> {
        self.discard_frame();
        let api = self.bridge.api();
        if !self.surface.is_null() {
            unsafe { api.release_surface.unwrap()(self.surface) };
            self.surface = ptr::null_mut();
        }
        let mut timed_out = false;
        if let Some(configuration) = self.configuration.take() {
            let device = configuration.device;
            if self.needs_cleanup {
                unsafe { api.submit_cleanup.unwrap()(self.instance, device) };
                let deadline = Instant::now() + Duration::from_secs(5);
                while unsafe { api.device_tick.unwrap()(device) } != 0 {
                    if Instant::now() >= deadline {
                        unsafe { api.device_destroy.unwrap()(device) };
                        timed_out = true;
                        break;
                    }
                    thread::sleep(Duration::from_millis(1));
                }
            }
            unsafe { api.release_device.unwrap()(device) };
        }
        if !self.instance.is_null() {
            unsafe { api.release_instance.unwrap()(self.instance) };
            self.instance = ptr::null_mut();
        }
        if timed_out {
            return Err(Error::from_reason(
                "Dawn cleanup timed out before closing the window",
            ));
        }
        Ok(())
    }
}

impl Drop for Surface {
    fn drop(&mut self) {
        let _ = self.close();
    }
}
