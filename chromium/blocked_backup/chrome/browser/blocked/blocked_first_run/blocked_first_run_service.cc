// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/blocked/blocked_first_run/blocked_first_run_service.h"

#include "base/logging.h"
#include "chrome/browser/first_run/first_run.h"
#include "chrome/browser/profiles/profile.h"
#include "components/prefs/pref_service.h"

namespace blocked {

BlockedFirstRunService::BlockedFirstRunService(Profile* profile)
    : profile_(profile), prefs_(profile->GetPrefs()) {
  LOG(INFO) << "BlockedFirstRunService initialized";
}

BlockedFirstRunService::~BlockedFirstRunService() = default;

void BlockedFirstRunService::Shutdown() {
  LOG(INFO) << "BlockedFirstRunService shutting down";
}

bool BlockedFirstRunService::IsFirstRun() const {
  return first_run::IsChromeFirstRun();
}

bool BlockedFirstRunService::HasAcceptedTerms() const {
  if (!prefs_) {
    return false;
  }
  return prefs_->GetBoolean(kBlockdHasAcceptedTerms);
}

bool BlockedFirstRunService::IsLoggedIn() const {
  if (!prefs_) {
    return false;
  }
  return prefs_->GetBoolean(kBlockdIsLoggedIn);
}

void BlockedFirstRunService::SetTermsAccepted(bool accepted) {
  if (!prefs_) {
    return;
  }
  prefs_->SetBoolean(kBlockdHasAcceptedTerms, accepted);
  LOG(INFO) << "Blockd terms acceptance set to: " << accepted;
}

void BlockedFirstRunService::SetLoggedIn(bool logged_in,
                                         const std::string& user_id) {
  if (!prefs_) {
    return;
  }
  prefs_->SetBoolean(kBlockdIsLoggedIn, logged_in);
  prefs_->SetString(kBlockdUserId, logged_in ? user_id : "");
  LOG(INFO) << "Blockd login state set to: " << logged_in;
}

void BlockedFirstRunService::ClearLoginState() {
  if (!prefs_) {
    return;
  }
  prefs_->SetBoolean(kBlockdIsLoggedIn, false);
  prefs_->SetString(kBlockdUserId, "");
  prefs_->SetString(kBlockdLastSessionId, "");
  LOG(INFO) << "Blockd login state cleared";
}

std::string BlockedFirstRunService::GetStartupUrl() const {
  // Priority order:
  // 1. If terms not accepted -> show terms page
  // 2. If not logged in -> show login page
  // 3. Otherwise -> show session page

  if (!HasAcceptedTerms()) {
    return kBlockdTermsUrl;
  }

  if (!IsLoggedIn()) {
    return kBlockdLoginUrl;
  }

  return kBlockdSessionUrl;
}

bool BlockedFirstRunService::ShouldShowTermsPage() const {
  return !HasAcceptedTerms();
}

bool BlockedFirstRunService::ShouldShowLoginPage() const {
  return HasAcceptedTerms() && !IsLoggedIn();
}

void BlockedFirstRunService::SetLastSessionId(const std::string& session_id) {
  if (!prefs_) {
    return;
  }
  prefs_->SetString(kBlockdLastSessionId, session_id);
}

std::string BlockedFirstRunService::GetLastSessionId() const {
  if (!prefs_) {
    return "";
  }
  return prefs_->GetString(kBlockdLastSessionId);
}

}  // namespace blocked
