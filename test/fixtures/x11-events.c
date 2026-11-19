#include <X11/Xlib.h>
#include <X11/Xutil.h>
#include <stdlib.h>
#include <string.h>

int main(int argc, char** argv) {
  if(argc != 3) return 2;
  const char* action = argv[1];
  const Window window = strtoul(argv[2], NULL, 0);
  Display* display = XOpenDisplay(NULL);
  if(!display) return 3;

  int result = 0;
  if(strcmp(action, "close") == 0) {
    XEvent event = {0};
    event.xclient.type = ClientMessage;
    event.xclient.window = window;
    event.xclient.message_type = XInternAtom(display, "WM_PROTOCOLS", False);
    event.xclient.format = 32;
    event.xclient.data.l[0] = XInternAtom(display, "WM_DELETE_WINDOW", False);
    event.xclient.data.l[1] = CurrentTime;
    if(!XSendEvent(display, window, False, NoEventMask, &event)) result = 4;
  } else if(strcmp(action, "minimize") == 0 || strcmp(action, "restore") == 0) {
    // Supply the ICCCM state a window manager would publish. GLFW reads it
    // through X11; keeping the window mapped isolates the drawable-state check.
    const Atom wm_state = XInternAtom(display, "WM_STATE", False);
    const long state[] = {strcmp(action, "minimize") == 0 ? IconicState : NormalState, None};
    XChangeProperty(display, window, wm_state, wm_state, 32, PropModeReplace,
                    (const unsigned char*)state, 2);
  } else {
    result = 2;
  }
  XSync(display, False);
  XCloseDisplay(display);
  return result;
}
