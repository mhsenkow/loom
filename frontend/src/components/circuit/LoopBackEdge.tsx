import { memo } from 'react'
import { BaseEdge, EdgeProps, getBezierPath } from 'reactflow'

// Custom edge component for loop-back connections (dotted, animated, purple)
export const LoopBackEdge = memo(({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
}: EdgeProps) => {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  return (
    <>
      <defs>
        <style>
          {`
            @keyframes dash {
              to {
                stroke-dashoffset: -12;
              }
            }
          `}
        </style>
      </defs>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          stroke: '#a855f7', // Purple color for loop-back
          strokeWidth: 2,
          strokeDasharray: '8,4', // Dotted line
          animation: 'dash 1s linear infinite',
        }}
        markerEnd={markerEnd}
      />
    </>
  )
})

LoopBackEdge.displayName = 'LoopBackEdge'
