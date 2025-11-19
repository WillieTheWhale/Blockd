cmake_minimum_required(VERSION 3.15)
project(blockd_browser VERSION 1.0.0 LANGUAGES CXX)

# C++ Standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Build type
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

# Compiler flags
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -Wall -Wextra")
set(CMAKE_CXX_FLAGS_DEBUG "${CMAKE_CXX_FLAGS_DEBUG} -g -O0")
set(CMAKE_CXX_FLAGS_RELEASE "${CMAKE_CXX_FLAGS_RELEASE} -O3")

# Find required packages
find_package(Threads REQUIRED)
find_package(OpenSSL REQUIRED)
find_package(Boost 1.70 REQUIRED COMPONENTS system)

# CEF (Chromium Embedded Framework)
# Assumes CEF is installed or downloaded separately
set(CEF_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/third_party/cef" CACHE PATH "Path to CEF root directory")

if(EXISTS "${CEF_ROOT}")
    set(CMAKE_MODULE_PATH ${CMAKE_MODULE_PATH} "${CEF_ROOT}/cmake")
    find_package(CEF REQUIRED)
    set(CEF_AVAILABLE TRUE)
else()
    message(WARNING "CEF not found at ${CEF_ROOT}. CEF-dependent targets will be skipped.")
    set(CEF_AVAILABLE FALSE)
endif()

# nlohmann/json (header-only)
# Can be installed via package manager or included as submodule
find_path(JSON_INCLUDE_DIR nlohmann/json.hpp
    PATHS
    /usr/include
    /usr/local/include
    ${CMAKE_CURRENT_SOURCE_DIR}/third_party/json/include
)

if(NOT JSON_INCLUDE_DIR)
    message(WARNING "nlohmann/json not found. Will attempt to use system include.")
    set(JSON_INCLUDE_DIR "")
endif()

# Include directories
include_directories(
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/src
    ${OPENSSL_INCLUDE_DIR}
    ${Boost_INCLUDE_DIRS}
    ${JSON_INCLUDE_DIR}
)

# WebSocket Client Library
add_library(websocket_client
    src/websocket_client.cpp
    src/websocket_client.h
    config.h
)

target_link_libraries(websocket_client
    ${CMAKE_THREAD_LIBS_INIT}
    ${OPENSSL_LIBRARIES}
    ${Boost_LIBRARIES}
)

target_include_directories(websocket_client PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/src
)

# WebSocket Message Handler (requires CEF)
if(CEF_AVAILABLE)
    add_library(websocket_message_handler
        src/websocket_message_handler.cpp
        src/websocket_message_handler.h
    )

    target_link_libraries(websocket_message_handler
        websocket_client
        libcef_lib
        libcef_dll_wrapper
    )

    target_include_directories(websocket_message_handler PUBLIC
        ${CEF_INCLUDE_PATH}
    )
endif()

# Browser Application (requires CEF)
if(CEF_AVAILABLE)
    add_library(browser_app
        src/browser_app.cpp
        src/browser_app.h
        src/main.cpp
    )

    target_link_libraries(browser_app
        websocket_client
        websocket_message_handler
        libcef_lib
        libcef_dll_wrapper
    )

    # Main executable
    add_executable(blockd_browser
        src/main.cpp
    )

    target_link_libraries(blockd_browser
        browser_app
        websocket_client
        websocket_message_handler
        ${CEF_LIBRARIES}
    )

    # Set executable properties for CEF
    SET_EXECUTABLE_TARGET_PROPERTIES(blockd_browser)
    ADD_LOGICAL_TARGET("libcef_lib" "${CEF_LIB_DEBUG}" "${CEF_LIB_RELEASE}")
endif()

# Testing
option(BUILD_TESTS "Build tests" ON)

if(BUILD_TESTS)
    enable_testing()

    # Google Test
    find_package(GTest)

    if(NOT GTest_FOUND)
        # Download and build Google Test
        include(FetchContent)
        FetchContent_Declare(
            googletest
            GIT_REPOSITORY https://github.com/google/googletest.git
            GIT_TAG release-1.12.1
        )
        FetchContent_MakeAvailable(googletest)
    endif()

    # WebSocket client tests
    add_executable(test_websocket_client
        tests/test_websocket_client.cpp
    )

    target_link_libraries(test_websocket_client
        websocket_client
        GTest::gtest
        GTest::gtest_main
        GTest::gmock
    )

    add_test(NAME WebSocketClientTests COMMAND test_websocket_client)

    # Copy mock server to build directory
    configure_file(
        ${CMAKE_CURRENT_SOURCE_DIR}/tests/mock_ws_server.py
        ${CMAKE_CURRENT_BINARY_DIR}/tests/mock_ws_server.py
        COPYONLY
    )
endif()

# Installation
install(TARGETS websocket_client
    LIBRARY DESTINATION lib
    ARCHIVE DESTINATION lib
)

install(FILES
    src/websocket_client.h
    config.h
    DESTINATION include/blockd
)

if(CEF_AVAILABLE)
    install(TARGETS blockd_browser
        RUNTIME DESTINATION bin
    )

    # Install CEF resources
    INSTALL_CEF_FILES("${CEF_ROOT}" "${CMAKE_INSTALL_PREFIX}/bin")
endif()

# JavaScript files
install(FILES
    js/websocket_handler.js
    DESTINATION share/blockd/js
)

# Documentation
install(FILES
    ../docs/websocket_protocol.md
    DESTINATION share/doc/blockd
)

# Print configuration summary
message(STATUS "===== Blockd Browser Configuration =====")
message(STATUS "Build type: ${CMAKE_BUILD_TYPE}")
message(STATUS "C++ compiler: ${CMAKE_CXX_COMPILER}")
message(STATUS "C++ standard: ${CMAKE_CXX_STANDARD}")
message(STATUS "OpenSSL version: ${OPENSSL_VERSION}")
message(STATUS "Boost version: ${Boost_VERSION}")
message(STATUS "CEF available: ${CEF_AVAILABLE}")
if(CEF_AVAILABLE)
    message(STATUS "CEF root: ${CEF_ROOT}")
endif()
message(STATUS "Build tests: ${BUILD_TESTS}")
message(STATUS "========================================")
