#pragma once
#include <string>
#include <vector>

namespace targetscan {
int findProcessPid(const std::string& imageName);
std::vector<int> udpPortsForPid(int pid);
}
