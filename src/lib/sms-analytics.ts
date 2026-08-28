export interface PracticeLog {
  score: number;
  maxScore: number;
  testName: string;
}

export interface TopicAnalytics {
  unitCode: string;
  title: string;
  averagePercentage: number;
  tier: 'GOOD' | 'MEDIUM' | 'LOW';
  recommendation: string;
}

export function analyzeTopicPerformance(
  unitCode: string,
  title: string,
  logs: PracticeLog[] = []
): TopicAnalytics {
  if (!logs || logs.length === 0) {
    return {
      unitCode,
      title,
      averagePercentage: 0,
      tier: 'LOW',
      recommendation: 'No test data recorded yet.',
    };
  }

  const totalObtained = logs.reduce((sum, s) => sum + s.score, 0);
  const totalMax = logs.reduce((sum, s) => sum + s.maxScore, 0);
  const avg = Math.round((totalObtained / totalMax) * 100);

  if (avg > 85) {
    return {
      unitCode,
      title,
      averagePercentage: avg,
      tier: 'GOOD',
      recommendation: 'Good performance (>85%). Minimal study required.',
    };
  } else if (avg >= 51) {
    return {
      unitCode,
      title,
      averagePercentage: avg,
      tier: 'MEDIUM',
      recommendation: 'Medium performance (51%-85%). Practise sample questions.',
    };
  } else {
    return {
      unitCode,
      title,
      averagePercentage: avg,
      tier: 'LOW',
      recommendation: 'Low performance (<=50%). Apply alternative study methods.',
    };
  }
}