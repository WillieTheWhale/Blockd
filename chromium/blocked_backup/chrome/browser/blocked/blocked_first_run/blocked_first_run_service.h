// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_BLOCKED_BLOCKED_FIRST_RUN_BLOCKED_FIRST_RUN_SERVICE_H_
#define CHROME_BROWSER_BLOCKED_BLOCKED_FIRST_RUN_BLOCKED_FIRST_RUN_SERVICE_H_

#include <string>

#include "base/memory/weak_ptr.h"
#include "components/keyed_service/core/keyed_service.h"

class Profile;
class PrefService;

namespace blocked {

// URLs for Blockd services
inline constexpr char kBlockdLoginUrl[] = "https://blockd.site/login";
inline constexpr char kBlockdSessionUrl[] = "https://blockd.site/session";
inline constexpr char kBlockdTermsUrl[] = "https://blockd.site/terms";

// Preference keys for Blockd first-run
inline constexpr char kBlockdHasAcceptedTerms[] = "blockd.has_accepted_terms";
inline constexpr char kBlockdIsLoggedIn[] = "blockd.is_logged_in";
inline constexpr char kBlockdUserId[] = "blockd.user_id";
inline constexpr char kBlockdLastSessionId[] = "blockd.last_session_id";

// Manages first-run experience for Blockd browser
// Ensures users:
// 1. Accept Terms of Service before using the browser
// 2. Create an account or log in
// 3. Navigate to the session/interview page
class BlockedFirstRunService : public KeyedService {
 public:
  explicit BlockedFirstRunService(Profile* profile);
  ~BlockedFirstRunService() override;

  // KeyedService implementation
  void Shutdown() override;

  // First-run checks
  bool IsFirstRun() const;
  bool HasAcceptedTerms() const;
  bool IsLoggedIn() const;

  // Actions
  void SetTermsAccepted(bool accepted);
  void SetLoggedIn(bool logged_in, const std::string& user_id);
  void ClearLoginState();

  // Navigation helpers
  std::string GetStartupUrl() const;
  bool ShouldShowTermsPage() const;
  bool ShouldShowLoginPage() const;

  // Session management
  void SetLastSessionId(const std::string& session_id);
  std::string GetLastSessionId() const;

 private:
  Profile* profile_;
  PrefService* prefs_;

  base::WeakPtrFactory<BlockedFirstRunService> weak_factory_{this};
};

}  // namespace blocked

#endif  // CHROME_BROWSER_BLOCKED_BLOCKED_FIRST_RUN_BLOCKED_FIRST_RUN_SERVICE_H_
