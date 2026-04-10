#include <QApplication>
#include <QFileInfo>
#include <QIcon>
#include <QWebChannel>
#include <QWebEngineProfile>
#include <QWebEngineSettings>
#include <QWebEngineView>

#include "FileBridge.h"

static void configureWebEngine(QWebEngineView* view) {
  auto* s = view->settings();
  s->setAttribute(QWebEngineSettings::JavascriptEnabled, true);
  s->setAttribute(QWebEngineSettings::LocalContentCanAccessFileUrls, true);
  s->setAttribute(QWebEngineSettings::LocalContentCanAccessRemoteUrls, true);
  s->setAttribute(QWebEngineSettings::JavascriptCanAccessClipboard, true);
  s->setAttribute(QWebEngineSettings::WebGLEnabled, true);
  s->setAttribute(QWebEngineSettings::Accelerated2dCanvasEnabled, true);
  s->setAttribute(QWebEngineSettings::PlaybackRequiresUserGesture, false);

  // Helpful for Monaco + worker scripts via data: URLs
  view->page()->profile()->setHttpCacheType(QWebEngineProfile::DiskHttpCache);
}

int main(int argc, char* argv[]) {
  QApplication app(argc, argv);
  QApplication::setApplicationName("Arc Mini IDE");
  QApplication::setOrganizationName("Arc");

  auto* view = new QWebEngineView();
  view->setWindowTitle("Arc Mini IDE");
  view->resize(1280, 800);

  configureWebEngine(view);

  auto* channel = new QWebChannel(view);
  auto* bridge = new FileBridge(channel);
  channel->registerObject("bridge", bridge);
  view->page()->setWebChannel(channel);

  view->setUrl(QUrl("qrc:/web/index.html"));
  view->show();

  return app.exec();
}

