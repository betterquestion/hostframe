#include <node_api.h>
#include <stdint.h>

struct BridgeHeader {
  uint32_t abi_version;
  uint32_t struct_size;
};

const struct BridgeHeader* hostframe_dawn_get_api(uint32_t version) {
  static const struct BridgeHeader api = {1, sizeof(struct BridgeHeader)};
  return version == api.abi_version ? &api : NULL;
}

NAPI_MODULE_INIT() {
  (void)env;
  return exports;
}
