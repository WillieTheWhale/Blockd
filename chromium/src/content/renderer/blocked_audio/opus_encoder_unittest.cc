// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "content/renderer/blocked_audio/opus_encoder.h"

#include <vector>

#include "testing/gtest/include/gtest/gtest.h"

namespace content {
namespace {

class OpusEncoderTest : public testing::Test {
 protected:
  OpusEncoderWrapper encoder_;
};

TEST_F(OpusEncoderTest, InitializesSuccessfully) {
  EXPECT_TRUE(encoder_.Initialize(48000, 1, 64000, 20));
  EXPECT_TRUE(encoder_.IsInitialized());
  EXPECT_EQ(encoder_.GetSamplesPerFrame(), 960);  // 48000 * 0.020
}

TEST_F(OpusEncoderTest, InitializesWithStereo) {
  EXPECT_TRUE(encoder_.Initialize(48000, 2, 128000, 20));
  EXPECT_TRUE(encoder_.IsInitialized());
}

TEST_F(OpusEncoderTest, RejectsInvalidSampleRate) {
  EXPECT_FALSE(encoder_.Initialize(44100, 1, 64000, 20));  // Not supported
  EXPECT_FALSE(encoder_.IsInitialized());
}

TEST_F(OpusEncoderTest, RejectsInvalidChannels) {
  EXPECT_FALSE(encoder_.Initialize(48000, 3, 64000, 20));  // 1 or 2 only
  EXPECT_FALSE(encoder_.IsInitialized());
}

TEST_F(OpusEncoderTest, RejectsInvalidFrameDuration) {
  EXPECT_FALSE(encoder_.Initialize(48000, 1, 64000, 15));  // Not supported
  EXPECT_FALSE(encoder_.IsInitialized());
}

TEST_F(OpusEncoderTest, EncodesAudioFrame) {
  ASSERT_TRUE(encoder_.Initialize(48000, 1, 64000, 20));

  // Create a silent audio frame (960 samples for 20ms at 48kHz).
  std::vector<float> input(960, 0.0f);
  std::vector<uint8_t> output;

  EXPECT_TRUE(encoder_.Encode(input.data(), input.size(), output));
  EXPECT_FALSE(output.empty());
  EXPECT_LE(output.size(), 1275u);  // Max Opus frame size
}

TEST_F(OpusEncoderTest, EncodesMultipleFrames) {
  ASSERT_TRUE(encoder_.Initialize(48000, 1, 64000, 20));

  std::vector<float> input(960, 0.0f);
  std::vector<uint8_t> output;

  for (int i = 0; i < 10; ++i) {
    EXPECT_TRUE(encoder_.Encode(input.data(), input.size(), output));
    EXPECT_FALSE(output.empty());
  }

  EXPECT_EQ(encoder_.GetTotalFramesEncoded(), 10);
  EXPECT_GT(encoder_.GetTotalBytesEncoded(), 0);
}

TEST_F(OpusEncoderTest, RejectsWrongFrameSize) {
  ASSERT_TRUE(encoder_.Initialize(48000, 1, 64000, 20));

  std::vector<float> input(500, 0.0f);  // Wrong size (should be 960)
  std::vector<uint8_t> output;

  EXPECT_FALSE(encoder_.Encode(input.data(), input.size(), output));
}

}  // namespace
}  // namespace content
