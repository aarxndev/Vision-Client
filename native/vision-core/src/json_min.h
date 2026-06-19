#pragma once
#include <cctype>
#include <map>
#include <string>
#include <vector>

namespace jsonmin {

struct Obj {
  std::map<std::string, std::string> s;
  std::map<std::string, double> n;
  std::map<std::string, bool> b;
  std::map<std::string, std::vector<Obj>> a;
  std::map<std::string, Obj> o;

  bool hasS(const std::string& k) const { return s.count(k); }
  bool hasN(const std::string& k) const { return n.count(k); }
  bool hasB(const std::string& k) const { return b.count(k); }
  bool hasA(const std::string& k) const { return a.count(k); }
  bool hasO(const std::string& k) const { return o.count(k); }
};

inline void skipWs(const std::string& t, size_t& i) {
  while (i < t.size() && std::isspace(static_cast<unsigned char>(t[i]))) ++i;
}

inline std::string parseStr(const std::string& t, size_t& i) {
  if (i >= t.size() || t[i] != '"') return "";
  ++i;
  std::string out;
  while (i < t.size()) {
    char c = t[i++];
    if (c == '"') break;
    if (c == '\\' && i < t.size()) {
      char e = t[i++];
      if (e == 'n') out.push_back('\n');
      else if (e == 'r') out.push_back('\r');
      else if (e == 't') out.push_back('\t');
      else out.push_back(e);
    } else out.push_back(c);
  }
  return out;
}

inline double parseNum(const std::string& t, size_t& i) {
  size_t start = i;
  if (i < t.size() && (t[i] == '-' || t[i] == '+')) ++i;
  while (i < t.size() && (std::isdigit(static_cast<unsigned char>(t[i])) || t[i] == '.')) ++i;
  return std::stod(t.substr(start, i - start));
}

Obj parseValue(const std::string& t, size_t& i);
std::vector<Obj> parseArray(const std::string& t, size_t& i);

inline Obj parseObj(const std::string& t, size_t& i) {
  Obj obj;
  if (i >= t.size() || t[i] != '{') return obj;
  ++i;
  while (true) {
    skipWs(t, i);
    if (i < t.size() && t[i] == '}') { ++i; break; }
    std::string key = parseStr(t, i);
    skipWs(t, i);
    if (i < t.size() && t[i] == ':') ++i;
    skipWs(t, i);
    if (i >= t.size()) break;
    char c = t[i];
    if (c == '"') obj.s[key] = parseStr(t, i);
    else if (c == '{' ) obj.o[key] = parseObj(t, i);
    else if (c == '[') obj.a[key] = parseArray(t, i);
    else if (c == 't' || c == 'f') {
      if (t.compare(i, 4, "true") == 0) { obj.b[key] = true; i += 4; }
      else if (t.compare(i, 5, "false") == 0) { obj.b[key] = false; i += 5; }
    } else if (c == 'n') { i += 4; }
    else obj.n[key] = parseNum(t, i);
    skipWs(t, i);
    if (i < t.size() && t[i] == ',') { ++i; continue; }
    if (i < t.size() && t[i] == '}') { ++i; break; }
  }
  return obj;
}

inline std::vector<Obj> parseArray(const std::string& t, size_t& i) {
  std::vector<Obj> arr;
  if (i >= t.size() || t[i] != '[') return arr;
  ++i;
  while (true) {
    skipWs(t, i);
    if (i < t.size() && t[i] == ']') { ++i; break; }
    if (i < t.size() && t[i] == '{') arr.push_back(parseObj(t, i));
    else if (i < t.size() && t[i] == '"') {
      Obj item;
      item.s["__str__"] = parseStr(t, i);
      arr.push_back(item);
    }
    skipWs(t, i);
    if (i < t.size() && t[i] == ',') { ++i; continue; }
    if (i < t.size() && t[i] == ']') { ++i; break; }
  }
  return arr;
}

inline Obj parseValue(const std::string& t, size_t& i) {
  skipWs(t, i);
  if (i < t.size() && t[i] == '{') return parseObj(t, i);
  return {};
}

inline Obj parse(const std::string& line) {
  size_t i = 0;
  return parseValue(line, i);
}

inline std::string esc(const std::string& s) {
  std::string o = "\"";
  for (char c : s) {
    if (c == '"') o += "\\\"";
    else if (c == '\\') o += "\\\\";
    else if (c == '\n') o += "\\n";
    else o += c;
  }
  o += '"';
  return o;
}

inline std::string strField(const std::string& k, const std::string& v) {
  return esc(k) + ":" + esc(v);
}

inline std::string numField(const std::string& k, double v) {
  return esc(k) + ":" + std::to_string(static_cast<int>(v));
}

inline std::string boolField(const std::string& k, bool v) {
  return esc(k) + ":" + (v ? "true" : "false");
}

}  
