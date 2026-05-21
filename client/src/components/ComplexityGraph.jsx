import { useEffect, useRef } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

const COMPLEXITY_ORDER = ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)', 'O(n²)', 'O(n³)', 'O(2ⁿ)', 'O(n!)']
const COMPLEXITY_VALUES = { 'O(1)': 1, 'O(log n)': 2, 'O(n)': 3, 'O(n log n)': 4, 'O(n²)': 5, 'O(n³)': 6, 'O(2ⁿ)': 7, 'O(n!)': 8 }
const COMPLEXITY_COLORS = {
  1: '#4ade80', 2: '#86efac', 3: '#7aa2f7',
  4: '#fbbf24', 5: '#f97316', 6: '#ef4444',
  7: '#dc2626', 8: '#991b1b'
}
const COMPLEXITY_RATINGS = {
  1: '🟢 Excellent', 2: '🟢 Great', 3: '🔵 Good',
  4: '🟡 Fair', 5: '🟠 Poor', 6: '🔴 Bad',
  7: '🔴 Very Bad', 8: '🔴 Terrible'
}
const COMPLEXITY_DESC = {
  'O(1)': 'Constant — best possible',
  'O(log n)': 'Logarithmic — very efficient',
  'O(n)': 'Linear — scales with input',
  'O(n log n)': 'Linearithmic — good for sorting',
  'O(n²)': 'Quadratic — avoid for large inputs',
  'O(n³)': 'Cubic — expensive',
  'O(2ⁿ)': 'Exponential — very expensive',
  'O(n!)': 'Factorial — worst case'
}

function parseComplexity(str) {
  if (!str) return 'O(n)'
  for (const c of COMPLEXITY_ORDER) {
    if (str.includes(c)) return c
  }
  if (str.toLowerCase().includes('constant')) return 'O(1)'
  if (str.toLowerCase().includes('linear')) return 'O(n)'
  if (str.toLowerCase().includes('quadratic')) return 'O(n²)'
  if (str.toLowerCase().includes('logarithmic')) return 'O(log n)'
  return 'O(n)'
}

function ComplexityGraph({ data }) {
  if (!data) return null

  const timeComplexity = parseComplexity(data.complexity)
  const spaceComplexity = parseComplexity(data.space_complexity || 'O(n)')

  const timeValue = COMPLEXITY_VALUES[timeComplexity] || 3
  const spaceValue = COMPLEXITY_VALUES[spaceComplexity] || 3
  const timeColor = COMPLEXITY_COLORS[timeValue]
  const spaceColor = COMPLEXITY_COLORS[spaceValue]
  const timeRating = COMPLEXITY_RATINGS[timeValue]
  const spaceRating = COMPLEXITY_RATINGS[spaceValue]

  // Bar chart with gradients
  const barData = {
    labels: ['Time Complexity', 'Space Complexity'],
    datasets: [
      {
        label: 'Complexity Level',
        data: [timeValue, spaceValue],
        backgroundColor: [
          timeColor + '99',
          spaceColor + '99',
        ],
        borderColor: [timeColor, spaceColor],
        borderWidth: 2,
        borderRadius: 10,
        borderSkipped: false,
        hoverBackgroundColor: [timeColor, spaceColor],
        hoverBorderWidth: 3,
      }
    ]
  }

  const barOptions = {
    responsive: true,
    animation: {
      duration: 1000,
      easing: 'easeInOutQuart',
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1a1d2e',
        borderColor: '#2d3154',
        borderWidth: 1,
        titleColor: '#e2e8f0',
        bodyColor: '#94a3b8',
        padding: 12,
        callbacks: {
          title: (ctx) => ['Time Complexity', 'Space Complexity'][ctx[0].dataIndex],
          label: (ctx) => {
            const complexities = [timeComplexity, spaceComplexity]
            const ratings = [timeRating, spaceRating]
            const descs = [COMPLEXITY_DESC[timeComplexity], COMPLEXITY_DESC[spaceComplexity]]
            return [
              ` ${complexities[ctx.dataIndex]}`,
              ` ${ratings[ctx.dataIndex]}`,
              ` ${descs[ctx.dataIndex]}`
            ]
          }
        }
      }
    },
    scales: {
      y: {
        min: 0,
        max: 8,
        ticks: {
          color: '#64748b',
          font: { size: 11 },
          callback: (val) => COMPLEXITY_ORDER[val - 1] || ''
        },
        grid: { color: '#2d315455' }
      },
      x: {
        ticks: {
          color: '#94a3b8',
          font: { size: 12, weight: 'bold' }
        },
        grid: { display: false }
      }
    }
  }

  // Growth curve
  const n = [1, 2, 4, 8, 16, 32, 64]

  const growthData = {
    labels: n.map(x => `n=${x}`),
    datasets: [
      {
        label: 'O(1)',
        data: n.map(() => 1),
        borderColor: '#4ade8066',
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false,
        tension: 0.4,
        borderDash: [4, 4]
      },
      {
        label: 'O(log n)',
        data: n.map(x => Math.log2(x)),
        borderColor: '#86efac66',
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false,
        tension: 0.4,
        borderDash: [4, 4]
      },
      {
        label: 'O(n)',
        data: n.map(x => x),
        borderColor: '#7aa2f766',
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false,
        tension: 0.4,
        borderDash: [4, 4]
      },
      {
        label: 'O(n²)',
        data: n.map(x => Math.min(x * x, 500)),
        borderColor: '#f9731666',
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false,
        tension: 0.4,
        borderDash: [4, 4]
      },
      {
        label: `★ Your Code (${timeComplexity})`,
        data: n.map(x => {
          if (timeComplexity === 'O(1)') return 1
          if (timeComplexity === 'O(log n)') return Math.log2(x)
          if (timeComplexity === 'O(n)') return x
          if (timeComplexity === 'O(n log n)') return x * Math.log2(x)
          if (timeComplexity === 'O(n²)') return Math.min(x * x, 500)
          if (timeComplexity === 'O(n³)') return Math.min(x * x * x, 500)
          if (timeComplexity === 'O(2ⁿ)') return Math.min(Math.pow(2, x), 500)
          return x
        }),
        borderColor: '#c084fc',
        backgroundColor: '#c084fc22',
        borderWidth: 3,
        pointRadius: 5,
        pointBackgroundColor: '#c084fc',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointHoverRadius: 8,
        fill: true,
        tension: 0.4,
      }
    ]
  }

  const growthOptions = {
    responsive: true,
    animation: {
      duration: 1200,
      easing: 'easeInOutQuart',
    },
    plugins: {
      legend: {
        labels: {
          color: '#94a3b8',
          font: { size: 11 },
          boxWidth: 20,
          padding: 12
        }
      },
      title: {
        display: true,
        text: '📈 Growth Rate Comparison',
        color: '#e2e8f0',
        font: { size: 13, weight: 'bold' },
        padding: { bottom: 12 }
      },
      tooltip: {
        backgroundColor: '#1a1d2e',
        borderColor: '#2d3154',
        borderWidth: 1,
        titleColor: '#e2e8f0',
        bodyColor: '#94a3b8',
        padding: 10,
      }
    },
    scales: {
      y: {
        ticks: { color: '#64748b', font: { size: 10 } },
        grid: { color: '#2d315455' }
      },
      x: {
        ticks: { color: '#64748b', font: { size: 10 } },
        grid: { color: '#2d315422' }
      }
    }
  }

  return (
    <div className="complexity-graph">

      {/* Summary Cards */}
      <div className="complexity-cards">
        <div className="complexity-card" style={{ borderColor: timeColor, boxShadow: `0 0 12px ${timeColor}33` }}>
          <div className="complexity-card-label">⏱ Time Complexity</div>
          <div className="complexity-card-value" style={{ color: timeColor }}>{timeComplexity}</div>
          <div className="complexity-card-rating">{timeRating}</div>
          <div className="complexity-card-desc">{COMPLEXITY_DESC[timeComplexity]}</div>
        </div>

        <div className="complexity-card" style={{ borderColor: spaceColor, boxShadow: `0 0 12px ${spaceColor}33` }}>
          <div className="complexity-card-label">💾 Space Complexity</div>
          <div className="complexity-card-value" style={{ color: spaceColor }}>{spaceComplexity}</div>
          <div className="complexity-card-rating">{spaceRating}</div>
          <div className="complexity-card-desc">{COMPLEXITY_DESC[spaceComplexity]}</div>
        </div>

        <div className="complexity-card" style={{ borderColor: '#7aa2f7', boxShadow: '0 0 12px #7aa2f733' }}>
          <div className="complexity-card-label">📝 Code Info</div>
          <div className="complexity-card-value" style={{ color: '#7aa2f7' }}>{data.language || 'Unknown'}</div>
          <div className="complexity-card-rating">🔵 {data.lines || 0} lines</div>
          <div className="complexity-card-desc">Lines of code analyzed</div>
        </div>
      </div>

      {/* Bar Chart */}
      <div className="chart-box">
        <div className="chart-title">📊 Complexity Level Comparison</div>
        <Bar data={barData} options={barOptions} />
      </div>

      {/* Growth Curve */}
      <div className="chart-box">
        <Line data={growthData} options={growthOptions} />
      </div>

      <style>{`
        .complexity-graph {
          display: flex;
          flex-direction: column;
          gap: 16px;
          animation: fadeIn 0.4s ease;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .complexity-cards {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }
        .complexity-card {
          background: #0f1117;
          border: 1px solid;
          border-radius: 12px;
          padding: 14px;
          text-align: center;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .complexity-card:hover {
          transform: translateY(-2px);
        }
        .complexity-card-label {
          font-size: 11px;
          color: #64748b;
          font-family: sans-serif;
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .complexity-card-value {
          font-size: 20px;
          font-weight: 700;
          font-family: 'Courier New', monospace;
          margin-bottom: 4px;
        }
        .complexity-card-rating {
          font-size: 12px;
          font-weight: 600;
          margin-bottom: 4px;
          color: #e2e8f0;
        }
        .complexity-card-desc {
          font-size: 10px;
          color: #475569;
          font-family: sans-serif;
          line-height: 1.4;
        }
        .chart-box {
          background: #0f1117;
          border: 1px solid #2d3154;
          border-radius: 12px;
          padding: 16px;
          transition: box-shadow 0.2s;
        }
        .chart-box:hover {
          box-shadow: 0 0 20px #2d315466;
        }
        .chart-title {
          font-size: 12px;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 12px;
          text-align: center;
        }
      `}</style>
    </div>
  )
}

export default ComplexityGraph