// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @fileoverview JavaScript for the Blocked home page.
 * Handles navigation to interview platforms.
 */

(function() {
  'use strict';

  /**
   * Handle platform button click.
   * Navigates to the URL specified in the button's data-url attribute.
   * @param {Event} event The click event.
   */
  function handleButtonClick(event) {
    const button = event.currentTarget;
    const url = button.dataset.url;

    if (url) {
      // Navigate in the current tab
      window.location.href = url;
    }
  }

  /**
   * Initialize the page by attaching event listeners.
   */
  function initialize() {
    const buttons = document.querySelectorAll('.platform-button');

    buttons.forEach(function(button) {
      button.addEventListener('click', handleButtonClick);
    });

    // Note: HTML buttons already handle Enter and Space key presses natively,
    // so no additional keyboard handler is needed.
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})();
