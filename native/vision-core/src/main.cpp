#include "core.h"
#include "json_min.h"

#include <iostream>
#include <string>

static std::string windivertDirFromArgs(int argc, char** argv) {
  for (int i = 1; i + 1 < argc; ++i) {
    if (std::string(argv[i]) == "--windivert-dir") return argv[i + 1];
  }
  return ".";
}

int main(int argc, char** argv) {
  std::ios::sync_with_stdio(false);
  std::cin.tie(nullptr);

  VisionCore core(windivertDirFromArgs(argc, argv));
  core.setEventHandler([](const std::string& line) {
    std::cout << line << '\n';
    std::cout.flush();
  });

  std::cout << "{\"event\":\"ready\"}\n";
  std::cout.flush();

  std::string line;
  while (std::getline(std::cin, line)) {
    if (line.empty()) continue;
    jsonmin::Obj req = jsonmin::parse(line);
    std::string resp = core.handleCommand(req);
    if (!resp.empty()) {
      std::cout << resp << '\n';
      std::cout.flush();
    }
  }
  return 0;
}
