#![allow(
    non_camel_case_types,
    non_upper_case_globals,
    non_snake_case,
    dead_code
)]

include!(concat!(env!("OUT_DIR"), "/dawn.rs"));

use napi::{Env, Error, Result, Status, bindgen_prelude::Unknown};
use std::{
    ffi::{CString, c_void},
    mem,
    ptr::NonNull,
};

pub struct Bridge {
    library: NonNull<c_void>,
    api: NonNull<HostframeDawnApi>,
}

impl Bridge {
    pub fn load(path: String) -> Result<Self> {
        let path = CString::new(path)?;
        let library = NonNull::new(unsafe {
            libc::dlopen(path.as_ptr(), libc::RTLD_NOW | libc::RTLD_NOLOAD)
        })
        .ok_or_else(|| Error::from_reason("Dawn addon must be loaded before ABI negotiation"))?;
        match Self::negotiate(library) {
            Ok(api) => Ok(Self { library, api }),
            Err(error) => {
                unsafe { libc::dlclose(library.as_ptr()) };
                Err(error)
            }
        }
    }

    fn negotiate(library: NonNull<c_void>) -> Result<NonNull<HostframeDawnApi>> {
        let symbol = unsafe { libc::dlsym(library.as_ptr(), c"hostframe_dawn_get_api".as_ptr()) };
        if symbol.is_null() {
            return Err(Error::from_reason(
                "Dawn addon does not export hostframe_dawn_get_api",
            ));
        }
        let get_api: unsafe extern "C" fn(u32) -> *mut HostframeDawnApi =
            unsafe { mem::transmute(symbol) };
        let api = NonNull::new(unsafe { get_api(HOSTFRAME_DAWN_ABI_V1) })
            .ok_or_else(|| Error::from_reason("Dawn addon does not support bridge ABI v1"))?;
        let header = api.as_ptr().cast::<u32>();
        let (version, size) = unsafe { (header.read(), header.add(1).read()) };
        if version != HOSTFRAME_DAWN_ABI_V1 {
            return Err(Error::from_reason("Incompatible Dawn bridge ABI version"));
        }
        if (size as usize) < mem::size_of::<HostframeDawnApi>() {
            return Err(Error::from_reason(
                "Dawn bridge table is too small for check_device",
            ));
        }
        let table = unsafe { api.as_ref() };
        if [
            table.acquire_instance.is_some(),
            table.acquire_device.is_some(),
            table.release_instance.is_some(),
            table.release_device.is_some(),
            table.request_surface_adapter.is_some(),
            table.wrap_surface_texture.is_some(),
            table.create_surface.is_some(),
            table.surface_get_capabilities.is_some(),
            table.surface_capabilities_free_members.is_some(),
            table.device_get_adapter.is_some(),
            table.release_adapter.is_some(),
            table.surface_configure.is_some(),
            table.surface_get_current_texture.is_some(),
            table.surface_present.is_some(),
            table.surface_unconfigure.is_some(),
            table.release_surface.is_some(),
            table.release_texture.is_some(),
            table.submit_cleanup.is_some(),
            table.device_tick.is_some(),
            table.device_destroy.is_some(),
            table.check_device.is_some(),
        ]
        .contains(&false)
        {
            return Err(Error::from_reason("Incomplete Dawn bridge table"));
        }
        Ok(api)
    }

    pub fn check_device(
        &self,
        instance: HostframeDawnInstance,
        device: HostframeDawnDevice,
    ) -> Result<()> {
        // Both handles are retained by the surface or the caller for this check.
        match unsafe { self.api().check_device.unwrap()(instance, device) } {
            HOSTFRAME_DAWN_DEVICE_USABLE => Ok(()),
            HOSTFRAME_DAWN_DEVICE_WRONG_INSTANCE => Err(Error::from_reason(
                "Device must belong to this surface's GPU instance",
            )),
            HOSTFRAME_DAWN_DEVICE_LOST_OR_DESTROYED => {
                Err(Error::from_reason("GPU device is lost or destroyed"))
            }
            _ => Err(Error::from_reason("Could not validate the Dawn GPU device")),
        }
    }

    pub fn api(&self) -> &HostframeDawnApi {
        unsafe { self.api.as_ref() }
    }
}

impl Drop for Bridge {
    fn drop(&mut self) {
        unsafe { libc::dlclose(self.library.as_ptr()) };
    }
}

pub fn value_from_bridge<'env>(
    env: Env,
    status: napi_status,
    value: napi_value,
    message: &str,
) -> Result<Unknown<'env>> {
    match status {
        napi_status_napi_ok if !value.is_null() => {
            Ok(unsafe { Unknown::from_raw_unchecked(env.raw(), value.cast()) })
        }
        napi_status_napi_pending_exception => Err(Error::new(Status::PendingException, message)),
        _ => Err(Error::from_reason(message)),
    }
}
