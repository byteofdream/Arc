#include "CodeAnalyzer.h"

#include <QFile>
#include <QFileInfo>
#include <QRegularExpression>
#include <QStringConverter>
#include <QTextStream>

static int lineNumberAtOffset(const QString& text, int offset) {
  int line = 1;
  const int n = qMin(offset, text.size());
  for (int i = 0; i < n; ++i) {
    if (text[i] == QLatin1Char('\n')) ++line;
  }
  return line;
}

static void matchAll(QVector<Symbol>& out, const QString& file, const QString& text,
                     const QRegularExpression& re, const QString& type) {
  auto it = re.globalMatch(text);
  while (it.hasNext()) {
    const QRegularExpressionMatch m = it.next();
    const QString name = m.captured(1);
    if (name.isEmpty()) continue;
    const int off = m.capturedStart(1);
    if (off < 0) continue;
    Symbol s;
    s.name = name;
    s.type = type;
    s.file = file;
    s.line = lineNumberAtOffset(text, off);
    out.push_back(std::move(s));
  }
}

QVector<Symbol> CodeAnalyzer::analyzeFile(const QString& absolutePath, const QString& utf8Text) {
  QVector<Symbol> out;
  const QString& text = utf8Text;
  const QString ext = QFileInfo(absolutePath).suffix().toLower();

  // C/C++-ish
  if (ext == QLatin1String("c") || ext == QLatin1String("cc") || ext == QLatin1String("cpp") ||
      ext == QLatin1String("cxx") || ext == QLatin1String("h") || ext == QLatin1String("hpp") ||
      ext == QLatin1String("hh") || ext == QLatin1String("hxx") || ext == QLatin1String("m") ||
      ext == QLatin1String("mm")) {
    static const QRegularExpression reClass(
        QStringLiteral(R"(^\s*(?:template\s*<[^>]{0,500}>\s*)?class\s+([A-Za-z_][\w]*))"),
        QRegularExpression::MultilineOption);
    static const QRegularExpression reStruct(
        QStringLiteral(R"(^\s*(?:template\s*<[^>]{0,500}>\s*)?struct\s+([A-Za-z_][\w]*))"),
        QRegularExpression::MultilineOption);
    static const QRegularExpression reEnum(QStringLiteral(R"(^\s*enum\s+(?:class\s+)?([A-Za-z_][\w]*))"),
                                           QRegularExpression::MultilineOption);
    static const QRegularExpression reNs(QStringLiteral(R"(^\s*namespace\s+([A-Za-z_][\w]*)\s*\{)"),
                                         QRegularExpression::MultilineOption);
    // Functions: return type + name + '(' — heuristic, misses constructors and some templates.
    static const QRegularExpression reFn(
        QStringLiteral(
            R"(^\s*(?:[\w:<>*&\s,]+)\s+([A-Za-z_][\w]*)\s*\([^;]*\)\s*(?:const\s*)?(?:override\s*)?(?:final\s*)?(?:noexcept\s*)?\{)"),
        QRegularExpression::MultilineOption);

    matchAll(out, absolutePath, text, reClass, QStringLiteral("class"));
    matchAll(out, absolutePath, text, reStruct, QStringLiteral("struct"));
    matchAll(out, absolutePath, text, reEnum, QStringLiteral("enum"));
    matchAll(out, absolutePath, text, reNs, QStringLiteral("namespace"));
    matchAll(out, absolutePath, text, reFn, QStringLiteral("function"));
  }

  // JavaScript / TypeScript
  if (ext == QLatin1String("js") || ext == QLatin1String("mjs") || ext == QLatin1String("cjs") ||
      ext == QLatin1String("ts") || ext == QLatin1String("tsx")) {
    static const QRegularExpression reFunc(
        QStringLiteral(R"(^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_][\w]*)\s*\()"),
        QRegularExpression::MultilineOption);
    static const QRegularExpression reClass(
        QStringLiteral(R"(^\s*(?:export\s+)?class\s+([A-Za-z_][\w]*))"),
        QRegularExpression::MultilineOption);
    static const QRegularExpression reConstFn(
        QStringLiteral(R"(^\s*(?:export\s+)?const\s+([A-Za-z_][\w]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)"),
        QRegularExpression::MultilineOption);
    static const QRegularExpression reLetFn(
        QStringLiteral(R"(^\s*(?:export\s+)?(?:let|var)\s+([A-Za-z_][\w]*)\s*=\s*function\s*\()"),
        QRegularExpression::MultilineOption);

    matchAll(out, absolutePath, text, reFunc, QStringLiteral("function"));
    matchAll(out, absolutePath, text, reClass, QStringLiteral("class"));
    matchAll(out, absolutePath, text, reConstFn, QStringLiteral("function"));
    matchAll(out, absolutePath, text, reLetFn, QStringLiteral("function"));
  }

  // Python
  if (ext == QLatin1String("py")) {
    static const QRegularExpression reDef(QStringLiteral(R"(^\s*def\s+([A-Za-z_][\w]*)\s*\()"),
                                         QRegularExpression::MultilineOption);
    static const QRegularExpression reClass(QStringLiteral(R"(^\s*class\s+([A-Za-z_][\w]*)\s*[\(:])"),
                                            QRegularExpression::MultilineOption);
    matchAll(out, absolutePath, text, reDef, QStringLiteral("function"));
    matchAll(out, absolutePath, text, reClass, QStringLiteral("class"));
  }

  return out;
}
