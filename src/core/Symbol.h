#pragma once

#include <QJsonObject>
#include <QString>

/**
 * Minimal symbol record for code intelligence MVP.
 * Designed to be replaced or augmented by AST-backed data later (e.g. scope, kind enum).
 */
struct Symbol {
  QString name;
  /** Logical kind: "class", "struct", "function", "variable", "enum", "namespace", "unknown". */
  QString type;
  QString file;
  int line{1};
};

inline QJsonObject symbolToJson(const Symbol& s) {
  QJsonObject o;
  o["name"] = s.name;
  o["type"] = s.type;
  o["file"] = s.file;
  o["line"] = s.line;
  return o;
}
