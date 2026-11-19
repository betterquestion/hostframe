use std::{env, path::PathBuf};

fn main() {
    napi_build::setup();

    let include = PathBuf::from("build/dawn/hostframe-dawn-linux-x64/include");
    let header = include.join("hostframe_dawn/bridge.h");
    assert!(
        header.is_file(),
        "Run bun scripts/setup.ts to install the pinned Dawn headers"
    );
    bindgen::Builder::default()
        .header(header.to_str().unwrap())
        .clang_arg(format!("-I{}", include.display()))
        .allowlist_type("HostframeDawnApi|WGPUSurfaceSourceXlibWindow")
        .allowlist_var(
            "HOSTFRAME_DAWN_ABI_V1|HOSTFRAME_DAWN_DEVICE_.*|WGPUTextureUsage_RenderAttachment",
        )
        .parse_callbacks(Box::new(bindgen::CargoCallbacks::new()))
        .generate()
        .expect("generate Dawn bridge bindings")
        .write_to_file(PathBuf::from(env::var_os("OUT_DIR").unwrap()).join("dawn.rs"))
        .expect("write Dawn bridge bindings");
}
