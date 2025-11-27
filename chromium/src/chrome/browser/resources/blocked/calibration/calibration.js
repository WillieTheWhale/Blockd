// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @fileoverview Eye tracking calibration UI implementation.
 */

(function() {
  'use strict';

  // Calibration configuration.
  const CONFIG = {
    numPoints: 9,
    durationPerPoint: 2000,  // 2 seconds
    samplesPerPoint: 60,  // 2 seconds at 30 FPS
    gridPositions: [
      [0.1, 0.1], [0.5, 0.1], [0.9, 0.1],
      [0.1, 0.5], [0.5, 0.5], [0.9, 0.5],
      [0.1, 0.9], [0.5, 0.9], [0.9, 0.9]
    ]
  };

  // DOM elements.
  let overlay;
  let instructions;
  let calibrationPoint;
  let progress;
  let progressText;
  let progressFill;
  let completion;
  let accuracyValue;
  let confidenceValue;

  // State.
  let currentPointIndex = 0;
  let collectedSamples = [];
  let isCalibrating = false;

  /**
   * Initialize calibration UI.
   */
  function initialize() {
    // Get DOM elements.
    overlay = document.getElementById('calibration-overlay');
    instructions = document.getElementById('instructions');
    calibrationPoint = document.getElementById('calibration-point');
    progress = document.getElementById('progress');
    progressText = document.getElementById('progress-text');
    progressFill = document.getElementById('progress-fill');
    completion = document.getElementById('completion');
    accuracyValue = document.getElementById('accuracy-value');
    confidenceValue = document.getElementById('confidence-value');

    // Bind event listeners.
    document.getElementById('start-button')
        .addEventListener('click', startCalibration);
    document.getElementById('continue-button')
        .addEventListener('click', continueToSession);
    document.getElementById('recalibrate-button')
        .addEventListener('click', restartCalibration);

    console.log('Calibration UI initialized');
  }

  /**
   * Show calibration overlay.
   */
  function show() {
    overlay.classList.remove('hidden');
    instructions.classList.remove('hidden');
  }

  /**
   * Hide calibration overlay.
   */
  function hide() {
    overlay.classList.add('hidden');
  }

  /**
   * Start calibration sequence.
   */
  function startCalibration() {
    if (isCalibrating) {
      return;
    }

    isCalibrating = true;
    currentPointIndex = 0;
    collectedSamples = [];

    // Hide instructions, show progress.
    instructions.classList.add('hidden');
    progress.classList.remove('hidden');

    // Start with first point.
    showCalibrationPoint(0);
  }

  /**
   * Show calibration point at index.
   * @param {number} index Point index (0-8).
   */
  function showCalibrationPoint(index) {
    if (index >= CONFIG.numPoints) {
      finishCalibration();
      return;
    }

    const [x, y] = CONFIG.gridPositions[index];

    // Update progress.
    progressText.textContent = `Point ${index + 1} of ${CONFIG.numPoints}`;
    const progressPercent = ((index + 1) / CONFIG.numPoints) * 100;
    progressFill.style.width = `${progressPercent}%`;

    // Position calibration point.
    calibrationPoint.style.left = `${x * 100}%`;
    calibrationPoint.style.top = `${y * 100}%`;
    calibrationPoint.classList.remove('hidden');

    // Notify BlockedAPI to start collecting samples.
    if (window.BlockedAPI) {
      notifyPointShown(x, y);
    }

    // Wait for duration, then move to next point.
    setTimeout(() => {
      currentPointIndex++;
      showCalibrationPoint(currentPointIndex);
    }, CONFIG.durationPerPoint);
  }

  /**
   * Notify BlockedAPI that calibration point is shown.
   * @param {number} x Normalized x coordinate.
   * @param {number} y Normalized y coordinate.
   */
  function notifyPointShown(x, y) {
    // In production, call BlockedAPI to collect gaze samples.
    console.log(`Calibration point shown at (${x}, ${y})`);

    // Simulate sample collection.
    const samples = [];
    for (let i = 0; i < CONFIG.samplesPerPoint; i++) {
      samples.push({
        x: x + (Math.random() - 0.5) * 0.05,
        y: y + (Math.random() - 0.5) * 0.05,
        confidence: 0.9 + Math.random() * 0.1
      });
    }
    collectedSamples.push({x, y, samples});
  }

  /**
   * Finish calibration and show results.
   */
  function finishCalibration() {
    isCalibrating = false;

    // Hide calibration point and progress.
    calibrationPoint.classList.add('hidden');
    progress.classList.add('hidden');

    // Compute calibration results.
    const results = computeCalibrationResults();

    // Show completion screen.
    accuracyValue.textContent = `${(results.accuracy * 100).toFixed(1)}%`;
    confidenceValue.textContent = `${(results.confidence * 100).toFixed(1)}%`;
    completion.classList.remove('hidden');

    // Notify BlockedAPI that calibration is complete.
    if (window.BlockedAPI) {
      notifyCalibrationComplete(results);
    }

    console.log('Calibration complete', results);
  }

  /**
   * Compute calibration results from collected samples.
   * @return {Object} Results with accuracy and confidence.
   */
  function computeCalibrationResults() {
    // In production, this would compute actual calibration matrix.
    // For now, return simulated results.

    let totalError = 0;
    let totalConfidence = 0;
    let sampleCount = 0;

    collectedSamples.forEach(point => {
      point.samples.forEach(sample => {
        const error = Math.sqrt(
          Math.pow(sample.x - point.x, 2) +
          Math.pow(sample.y - point.y, 2)
        );
        totalError += error;
        totalConfidence += sample.confidence;
        sampleCount++;
      });
    });

    const avgError = totalError / sampleCount;
    const avgConfidence = totalConfidence / sampleCount;

    // Convert error to accuracy score (lower error = higher accuracy).
    const accuracy = Math.max(0, 1 - avgError * 10);

    return {
      accuracy,
      confidence: avgConfidence,
      samples: collectedSamples
    };
  }

  /**
   * Notify BlockedAPI that calibration is complete.
   * @param {Object} results Calibration results.
   */
  function notifyCalibrationComplete(results) {
    // In production, send results to BlockedAPI.
    console.log('Sending calibration results to BlockedAPI', results);
  }

  /**
   * Continue to session after calibration.
   */
  function continueToSession() {
    hide();
    console.log('Continuing to session');
  }

  /**
   * Restart calibration.
   */
  function restartCalibration() {
    completion.classList.add('hidden');
    startCalibration();
  }

  // Initialize on load.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

  // Expose API for external control.
  window.BlockedCalibration = {
    show,
    hide,
    start: startCalibration
  };

})();
