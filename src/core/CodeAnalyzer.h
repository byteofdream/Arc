#pragma once

#include "Symbol.h"

#include <QVector>

/**
 * Regex-oriented symbol extraction MVP. Replace with clangd/libclang or tree-sitter later.
 */
class CodeAnalyzer {
public:
  static QVector<Symbol> analyzeFile(const QString& absolutePath, const QString& utf8Text);
};
