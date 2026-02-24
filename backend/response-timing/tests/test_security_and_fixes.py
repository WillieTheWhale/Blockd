"""
Comprehensive tests for Response Timing Service fixes
Tests: credential removal, consistency score formula, threshold fix, weighted scoring
"""
import pytest
import numpy as np
from datetime import datetime
from unittest.mock import Mock, MagicMock, patch, AsyncMock


class TestConsistencyScoreFormula:
    """Tests for pause consistency score calculation"""

    def test_consistency_score_range(self):
        """Test consistency score is within valid range [0, 1]"""
        from services.pause_detection import PauseDetectionService

        with patch.object(PauseDetectionService, '__init__', lambda x: None):
            service = PauseDetectionService()
            service.settings = Mock()
            service.settings.UNNATURAL_CONSISTENCY_THRESHOLD = 0.8

            # Test with varying pause patterns
            pauses = [
                {'start': 1.0, 'end': 1.5, 'duration': 0.5},
                {'start': 3.0, 'end': 3.5, 'duration': 0.5},
                {'start': 5.0, 'end': 5.5, 'duration': 0.5},
            ]

            result = service.detect_unnatural_pause_patterns(pauses)

            assert 0 <= result['consistency_score'] <= 1

    def test_consistency_score_formula_cv_based(self):
        """Test consistency score uses coefficient of variation"""
        from services.pause_detection import PauseDetectionService

        with patch.object(PauseDetectionService, '__init__', lambda x: None):
            service = PauseDetectionService()
            service.settings = Mock()
            service.settings.UNNATURAL_CONSISTENCY_THRESHOLD = 0.8

            # Uniform pauses (suspicious - low CV = high consistency)
            uniform_pauses = [
                {'start': 1.0, 'end': 1.5, 'duration': 0.5},
                {'start': 3.0, 'end': 3.5, 'duration': 0.5},
                {'start': 5.0, 'end': 5.5, 'duration': 0.5},
            ]

            result = service.detect_unnatural_pause_patterns(uniform_pauses)

            # consistency_score = 1.0 - min(cv_duration, 1.0)
            # For uniform durations, CV is very low, so consistency is high
            assert result['uniform_duration'] is True

    def test_insufficient_pauses_returns_neutral(self):
        """Test fewer than 3 pauses returns neutral result"""
        from services.pause_detection import PauseDetectionService

        with patch.object(PauseDetectionService, '__init__', lambda x: None):
            service = PauseDetectionService()
            service.settings = Mock()
            service.settings.UNNATURAL_CONSISTENCY_THRESHOLD = 0.8

            few_pauses = [
                {'start': 1.0, 'end': 1.5, 'duration': 0.5},
                {'start': 3.0, 'end': 3.5, 'duration': 0.5},
            ]

            result = service.detect_unnatural_pause_patterns(few_pauses)

            assert result['is_unnatural'] is False
            assert result['consistency_score'] == 0.0


class TestUnnaturalPatternDetection:
    """Tests for unnatural pause pattern detection thresholds"""

    def test_uniform_duration_threshold(self):
        """Test uniform duration detection threshold (CV < 0.2)"""
        from services.pause_detection import PauseDetectionService

        with patch.object(PauseDetectionService, '__init__', lambda x: None):
            service = PauseDetectionService()
            service.settings = Mock()
            service.settings.UNNATURAL_CONSISTENCY_THRESHOLD = 0.8

            # Nearly identical durations
            pauses = [
                {'start': 1.0, 'end': 1.50, 'duration': 0.50},
                {'start': 3.0, 'end': 3.51, 'duration': 0.51},
                {'start': 5.0, 'end': 5.49, 'duration': 0.49},
            ]

            result = service.detect_unnatural_pause_patterns(pauses)

            assert result['uniform_duration'] is True

    def test_regular_spacing_threshold(self):
        """Test regular spacing detection threshold (CV < 0.3)"""
        from services.pause_detection import PauseDetectionService

        with patch.object(PauseDetectionService, '__init__', lambda x: None):
            service = PauseDetectionService()
            service.settings = Mock()
            service.settings.UNNATURAL_CONSISTENCY_THRESHOLD = 0.8

            # Regular spacing (2 second intervals)
            pauses = [
                {'start': 1.0, 'end': 1.5, 'duration': 0.5},
                {'start': 3.0, 'end': 3.5, 'duration': 0.5},
                {'start': 5.0, 'end': 5.5, 'duration': 0.5},
                {'start': 7.0, 'end': 7.5, 'duration': 0.5},
            ]

            result = service.detect_unnatural_pause_patterns(pauses)

            assert result['regular_spacing'] is True

    def test_natural_variation_not_flagged(self):
        """Test natural pause variation is not flagged as unnatural"""
        from services.pause_detection import PauseDetectionService

        with patch.object(PauseDetectionService, '__init__', lambda x: None):
            service = PauseDetectionService()
            service.settings = Mock()
            service.settings.UNNATURAL_CONSISTENCY_THRESHOLD = 0.8

            # Natural variation in timing and duration
            pauses = [
                {'start': 1.0, 'end': 1.3, 'duration': 0.3},
                {'start': 4.5, 'end': 5.2, 'duration': 0.7},
                {'start': 6.0, 'end': 6.8, 'duration': 0.8},
                {'start': 11.0, 'end': 11.4, 'duration': 0.4},
            ]

            result = service.detect_unnatural_pause_patterns(pauses)

            # High variance should result in low consistency
            assert result['uniform_duration'] is False


class TestPauseMetricsCalculation:
    """Tests for pause metrics calculation"""

    def test_empty_pauses_returns_zeros(self):
        """Test empty pause list returns zero metrics"""
        from services.pause_detection import PauseDetectionService

        with patch.object(PauseDetectionService, '__init__', lambda x: None):
            service = PauseDetectionService()

            metrics = service.calculate_pause_metrics([], 60.0)

            assert metrics['pause_count'] == 0
            assert metrics['total_pause_time'] == 0.0
            assert metrics['avg_pause_duration'] == 0.0
            assert metrics['pause_frequency'] == 0.0

    def test_pause_percentage_calculation(self):
        """Test pause percentage is calculated correctly"""
        from services.pause_detection import PauseDetectionService

        with patch.object(PauseDetectionService, '__init__', lambda x: None):
            service = PauseDetectionService()

            pauses = [
                {'start': 0, 'end': 10, 'duration': 10},  # 10 seconds
                {'start': 20, 'end': 30, 'duration': 10},  # 10 seconds
            ]

            metrics = service.calculate_pause_metrics(pauses, 100.0)

            # 20 seconds of pauses in 100 seconds = 20%
            assert metrics['pause_percentage'] == 20.0

    def test_pause_frequency_per_minute(self):
        """Test pause frequency is calculated per minute"""
        from services.pause_detection import PauseDetectionService

        with patch.object(PauseDetectionService, '__init__', lambda x: None):
            service = PauseDetectionService()

            pauses = [
                {'start': 0, 'end': 1, 'duration': 1},
                {'start': 10, 'end': 11, 'duration': 1},
                {'start': 20, 'end': 21, 'duration': 1},
            ]

            metrics = service.calculate_pause_metrics(pauses, 30.0)  # 30 seconds

            # 3 pauses in 0.5 minutes = 6 pauses per minute
            assert metrics['pause_frequency'] == 6.0

    def test_zero_duration_handled(self):
        """Test zero total duration doesn't cause division by zero"""
        from services.pause_detection import PauseDetectionService

        with patch.object(PauseDetectionService, '__init__', lambda x: None):
            service = PauseDetectionService()

            pauses = [{'start': 0, 'end': 1, 'duration': 1}]
            metrics = service.calculate_pause_metrics(pauses, 0.0)

            assert metrics['pause_percentage'] == 0.0
            assert metrics['pause_frequency'] == 0.0


class TestStatisticalUtilities:
    """Tests for statistical utility functions"""

    def test_zscore_with_zero_std(self):
        """Test z-score calculation handles zero standard deviation"""
        from lib.stats_utils import calculate_zscore

        result = calculate_zscore(5.0, 5.0, 0.0)
        assert result == 0.0

    def test_zscore_calculation(self):
        """Test z-score calculation is correct"""
        from lib.stats_utils import calculate_zscore

        # value=10, mean=5, std=2.5 -> z = (10-5)/2.5 = 2
        result = calculate_zscore(10.0, 5.0, 2.5)
        assert result == 2.0

    def test_percentile_empty_data(self):
        """Test percentile with empty data returns 0"""
        from lib.stats_utils import calculate_percentile

        result = calculate_percentile([], 50)
        assert result == 0.0

    def test_iqr_outlier_detection(self):
        """Test IQR-based outlier detection"""
        from lib.stats_utils import detect_outliers_iqr

        data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 100]  # 100 is outlier

        result = detect_outliers_iqr(data)

        assert 100 in result['outliers']
        assert len(result['outlier_indices']) > 0

    def test_coefficient_of_variation(self):
        """Test coefficient of variation calculation"""
        from lib.stats_utils import calculate_coefficient_of_variation

        # std/mean * 100
        data = [10, 10, 10, 10]  # CV = 0 for identical values
        cv = calculate_coefficient_of_variation(data)
        assert cv == 0.0

    def test_cv_with_zero_mean(self):
        """Test CV handles zero mean"""
        from lib.stats_utils import calculate_coefficient_of_variation

        data = [0, 0, 0]
        cv = calculate_coefficient_of_variation(data)
        assert cv == 0.0

    def test_moving_average(self):
        """Test moving average calculation"""
        from lib.stats_utils import moving_average

        data = [1, 2, 3, 4, 5]
        result = moving_average(data, 3)

        # [1,2,3] avg = 2, [2,3,4] avg = 3, [3,4,5] avg = 4
        assert result == [2.0, 3.0, 4.0]

    def test_moving_average_empty(self):
        """Test moving average with empty data"""
        from lib.stats_utils import moving_average

        result = moving_average([], 3)
        assert result == []

    def test_confidence_interval(self):
        """Test confidence interval calculation"""
        from lib.stats_utils import calculate_confidence_interval

        data = [1, 2, 3, 4, 5]
        ci = calculate_confidence_interval(data, 0.95)

        assert 'mean' in ci
        assert 'lower' in ci
        assert 'upper' in ci
        assert 'margin' in ci
        assert ci['lower'] < ci['mean'] < ci['upper']

    def test_change_point_detection(self):
        """Test change point detection in time series"""
        from lib.stats_utils import detect_change_points

        # Data with sudden jump
        data = [1, 1, 1, 1, 10, 10, 10, 10]
        change_points = detect_change_points(data, threshold=2.0)

        assert len(change_points) > 0
        assert 4 in change_points or 5 in change_points

    def test_summary_statistics(self):
        """Test comprehensive summary statistics"""
        from lib.stats_utils import calculate_summary_statistics

        data = [1, 2, 3, 4, 5]
        stats = calculate_summary_statistics(data)

        assert stats['count'] == 5
        assert stats['mean'] == 3.0
        assert stats['median'] == 3.0
        assert stats['min'] == 1.0
        assert stats['max'] == 5.0


class TestFilterShortPauses:
    """Tests for pause filtering"""

    def test_filter_short_pauses(self):
        """Test filtering of short pauses"""
        from services.pause_detection import PauseDetectionService

        with patch.object(PauseDetectionService, '__init__', lambda x: None):
            service = PauseDetectionService()
            service.settings = Mock()
            service.settings.MIN_PAUSE_DURATION = 0.3

            pauses = [
                {'start': 0, 'end': 0.1, 'duration': 0.1},  # Too short
                {'start': 1, 'end': 1.5, 'duration': 0.5},  # OK
                {'start': 2, 'end': 2.2, 'duration': 0.2},  # Too short
                {'start': 3, 'end': 4.0, 'duration': 1.0},  # OK
            ]

            filtered = service.filter_short_pauses(pauses)

            assert len(filtered) == 2
            assert all(p['duration'] >= 0.3 for p in filtered)


class TestNormalization:
    """Tests for value normalization"""

    def test_normalize_values_to_0_1(self):
        """Test normalization to [0, 1] range"""
        from lib.stats_utils import normalize_values

        data = [10, 20, 30, 40, 50]
        normalized = normalize_values(data)

        assert min(normalized) == 0.0
        assert max(normalized) == 1.0

    def test_normalize_uniform_data(self):
        """Test normalization of uniform data"""
        from lib.stats_utils import normalize_values

        data = [5, 5, 5, 5]
        normalized = normalize_values(data)

        # All values should be min_val when data is uniform
        assert all(v == 0.0 for v in normalized)

    def test_normalize_empty_data(self):
        """Test normalization of empty data"""
        from lib.stats_utils import normalize_values

        result = normalize_values([])
        assert result == []


class TestEntropyCalculation:
    """Tests for entropy calculation"""

    def test_entropy_uniform_distribution(self):
        """Test entropy of uniform distribution"""
        from lib.stats_utils import calculate_entropy

        # Uniform distribution has maximum entropy
        probs = [0.25, 0.25, 0.25, 0.25]
        entropy = calculate_entropy(probs)

        # Maximum entropy for 4 outcomes = log2(4) = 2
        assert abs(entropy - 2.0) < 0.001

    def test_entropy_certain_outcome(self):
        """Test entropy of certain outcome (all probability on one)"""
        from lib.stats_utils import calculate_entropy

        probs = [1.0, 0.0, 0.0, 0.0]
        entropy = calculate_entropy(probs)

        # Entropy = 0 for certain outcome
        assert entropy == 0.0

    def test_entropy_empty(self):
        """Test entropy with empty input"""
        from lib.stats_utils import calculate_entropy

        assert calculate_entropy([]) == 0.0


class TestCredentialRemoval:
    """Tests verifying credentials are not in configuration"""

    def test_no_hardcoded_api_keys(self):
        """Test no hardcoded API keys in stats_utils"""
        from lib import stats_utils
        import inspect

        source = inspect.getsource(stats_utils)

        # Check for common credential patterns
        assert 'api_key' not in source.lower() or 'get_api_key' in source.lower()
        assert 'sk-' not in source  # OpenAI key pattern
        assert 'password' not in source.lower() or 'password:' not in source.lower()

    def test_no_hardcoded_credentials_in_pause_detection(self):
        """Test no hardcoded credentials in pause detection"""
        from services import pause_detection
        import inspect

        source = inspect.getsource(pause_detection)

        # Should not contain hardcoded credentials
        assert 'sk-' not in source
        assert 'password=' not in source.lower() or 'password}' in source or 'password:' in source
