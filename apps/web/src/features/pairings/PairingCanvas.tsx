import { useComputedColorScheme } from '@mantine/core';
import { Background, Controls, Position, ReactFlow, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { ChainBox, ChainLayout } from './chain-layout';
import { pathToLeaf } from './chain-selection';
import classes from './ChainFlow.module.css';

interface Props {
  layout: ChainLayout;
  label: (box: ChainBox) => string;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}

export default function PairingCanvas({ layout, label, selectedId, onSelect }: Props) {
  const colorMode = useComputedColorScheme('light', { getInitialValueInEffect: false });
  const path = pathToLeaf(layout.edges, selectedId);
  const nodes: Node<{ label: string }>[] = layout.nodes.map((box) => {
    const isLeaf = box.kind === 'leaf';
    const selected = box.id === selectedId;
    const text = label(box);
    return {
      id: box.id,
      type: box.kind === 'root' ? 'input' : isLeaf ? 'output' : 'default',
      position: { x: box.x, y: box.y },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: { label: text },
      style: {
        width: box.w,
        minHeight: box.h,
        borderColor: path.has(box.id) ? 'var(--mantine-primary-color-filled)' : undefined,
      },
      selectable: isLeaf,
      focusable: isLeaf,
      selected,
      ...(isLeaf && {
        ariaLabel: `Final line-up, ${text.replaceAll('\n', ', ')}`,
        ariaRole: 'button',
        domAttributes: { 'aria-pressed': selected },
      }),
    };
  });
  const edges: Edge[] = layout.edges.map(({ from, to, width }) => ({
    id: to,
    source: from,
    target: to,
    selectable: false,
    style: path.has(to)
      ? { stroke: 'var(--mantine-primary-color-filled)', strokeWidth: Math.max(width, 4) }
      : { strokeWidth: width, opacity: 0.55 },
  }));

  return (
    <div className={classes.canvas} role="region" aria-label="React Flow pairing diagram">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        forceColorMode={colorMode}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        edgesReconnectable={false}
        deleteKeyCode={null}
        zoomOnScroll={false}
        fitView
        onNodeClick={(_event, node) => {
          if (node.selectable) onSelect(node.id);
        }}
        onNodesChange={(changes) => {
          const pick = changes.getByType('select').find((change) => change.selected);
          if (pick) onSelect(pick.id);
        }}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
