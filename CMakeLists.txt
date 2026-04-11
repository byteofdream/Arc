cmake_minimum_required(VERSION 3.21)

project(ArcIDE LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

find_package(Qt6 REQUIRED COMPONENTS Widgets WebEngineWidgets WebChannel Network)

qt_add_executable(arc-ide
  src/main.cpp
  src/FileBridge.h
  src/FileBridge.cpp
  src/core/ThreadPool.h
  src/core/ThreadPool.cpp
  src/core/Symbol.h
  src/core/CodeAnalyzer.h
  src/core/CodeAnalyzer.cpp
  src/core/SymbolIndex.h
  src/core/SymbolIndex.cpp
  src/core/ProjectIndexer.h
  src/core/ProjectIndexer.cpp
  src/core/AutoSaveManager.h
  src/core/AutoSaveManager.cpp
  src/core/WorkspaceWatcher.h
  src/core/WorkspaceWatcher.cpp
  resources/resources.qrc
)

target_include_directories(arc-ide PRIVATE ${CMAKE_SOURCE_DIR}/src)

target_link_libraries(arc-ide PRIVATE
  Qt6::Widgets
  Qt6::WebEngineWidgets
  Qt6::WebChannel
  Qt6::Network
)

add_custom_command(
  TARGET arc-ide POST_BUILD
  COMMAND ${CMAKE_COMMAND} -E copy_directory
          ${CMAKE_SOURCE_DIR}/extensions
          $<TARGET_FILE_DIR:arc-ide>/extensions
  COMMENT "Copy bundled extensions next to arc-ide"
)
