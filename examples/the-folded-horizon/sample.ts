import {
  projectSchema,
  effect,
  always,
  type Condition,
  type Project,
} from '../../packages/domain/src/index';
const variable = (ref: string, value: string | boolean): Condition => ({
  kind: 'compare',
  source: 'variable',
  ref,
  key: '',
  op: 'eq',
  value,
});
const passage = (
  id: string,
  name: string,
  from: string,
  to: string,
  reverseId = '',
  rest: Record<string, unknown> = {},
) => ({ id, name, from, to, reverseId, ...rest });
export function foldedHorizon(): Project {
  return projectSchema.parse({
    id: 'world-folded-horizon',
    title: 'The Folded Horizon',
    author: 'ElseWhen',
    version: '1.0.0',
    start: 'loc-nexus',
    description: 'An impossible world. A name written between the stars. A way home.',
    intro:
      'You have followed the signal beyond the edge of every chart. Here, distance is a matter of memory, and the horizon folds back on itself. Somewhere in this strange world, a way home is waiting.',
    locations: [
      {
        id: 'loc-nexus',
        name: 'Nexus',
        category: 'Confluence',
        position: [0, 0, 0],
        color: '#edbd62',
        icon: 'orbit',
        description:
          'A ring of dark stone hangs in a vast, quiet chamber. At its center, a forked anchor cradles a thread of pale light. A stone arch leads into the earth; a spiral stair winds out of sight.',
        variants: [
          {
            id: 'desc-active',
            mode: 'append',
            condition: variable('var-wormhole', 'Active'),
            text: 'A violet seam holds steady beside the anchor. Beyond it, distant voices arrive before they are spoken.',
          },
        ],
      },
      {
        id: 'loc-cavern',
        name: 'Crystal Cavern',
        aliases: ['cavern'],
        category: 'Cavern',
        region: 'Below the Nexus',
        position: [-1, -1, 5],
        color: '#26c8d2',
        icon: 'gem',
        description:
          'Pale crystals rise from the cavern floor. A low hum gathers in the spaces between them. One small shard shines with a rhythm that seems almost familiar.',
      },
      {
        id: 'loc-gate',
        name: 'Gate Chamber',
        category: 'Place',
        position: [-6, -0.5, 1],
        color: '#eeb45e',
        icon: 'door',
        description:
          'A brass gate divides the chamber, its lock shaped like a branching star. Beside it rests a weathered metal case. The spiral stair returns to the Nexus.',
      },
      {
        id: 'loc-archive',
        name: 'Sunken Archive',
        category: 'Archive',
        position: [6, 0.2, 1],
        color: '#59a9ef',
        icon: 'book',
        description:
          'Shelves descend into water as still as glass. Above the tide line, a chart of impossible stars lies beside two ledgers. An Archivist tends the remnants of a history that has not happened yet.',
      },
      {
        id: 'loc-echo',
        name: 'Echo Dimension',
        category: 'Dimension',
        position: [4, 2, -5],
        color: '#b587ef',
        icon: 'orbit',
        description:
          'You stand inside the echo of a place. Distant voices arrive before they are spoken. A silver thread stretches toward a small observatory, suspended in the unmade sky.',
      },
      {
        id: 'loc-observatory',
        name: 'Observatory',
        category: 'Observatory',
        position: [-5, 2, -5],
        color: '#9c86e8',
        icon: 'telescope',
        description:
          'The telescope points inward, toward a sky contained in a single prism. A console waits beneath it, listening. The silver thread returns through the dark.',
      },
      {
        id: 'loc-shore',
        name: 'Silent Shore',
        category: 'Possibility',
        position: [5, -1, 7],
        color: '#62b9da',
        icon: 'waves',
        description:
          'A shore of smooth white stones meets an ocean without a horizon. For the first time since you arrived, the wind sounds like the world you remember.',
      },
    ],
    connections: [
      passage('exit-arch', 'Stone Arch', 'loc-nexus', 'loc-cavern', 'exit-arch-back', {
        aliases: ['arch', 'cavern'],
      }),
      passage('exit-arch-back', 'Stone Arch', 'loc-cavern', 'loc-nexus', 'exit-arch', {
        aliases: ['arch', 'nexus'],
      }),
      passage('exit-stair', 'Spiral Stair', 'loc-nexus', 'loc-gate', 'exit-stair-back', {
        aliases: ['stair', 'stairs'],
      }),
      passage('exit-stair-back', 'Spiral Stair', 'loc-gate', 'loc-nexus', 'exit-stair', {
        aliases: ['stair', 'stairs'],
      }),
      passage('exit-gate', 'Brass Gate', 'loc-gate', 'loc-archive', 'exit-gate-back', {
        aliases: ['gate'],
        doorId: 'obj-gate',
      }),
      passage('exit-gate-back', 'Brass Gate', 'loc-archive', 'loc-gate', 'exit-gate', {
        aliases: ['gate'],
        doorId: 'obj-gate',
      }),
      passage('exit-wormhole', 'Wormhole', 'loc-nexus', 'loc-echo', '', {
        kind: 'wormhole',
        enabled: false,
        concealed: true,
        revealDestination: true,
      }),
      passage('exit-return', 'Return Fold', 'loc-echo', 'loc-nexus', '', {
        kind: 'wormhole',
        aliases: ['fold', 'return'],
        revealDestination: true,
      }),
      passage('exit-thread', 'Silver Thread', 'loc-echo', 'loc-observatory', 'exit-thread-back', {
        aliases: ['thread'],
      }),
      passage('exit-thread-back', 'Silver Thread', 'loc-observatory', 'loc-echo', 'exit-thread', {
        aliases: ['thread'],
      }),
      passage('exit-seam', 'Horizon Seam', 'loc-observatory', 'loc-shore', '', {
        aliases: ['seam'],
        kind: 'rift',
        enabled: false,
        concealed: true,
      }),
    ],
    objects: [
      {
        id: 'obj-lantern',
        name: 'Survey Lantern',
        aliases: ['lantern', 'light'],
        description: 'A compact survey lantern with a steady blue flame. It needs no fuel.',
        placement: { kind: 'location', id: 'loc-nexus' },
        capabilities: ['portable', 'light'],
        active: true,
      },
      {
        id: 'obj-shard',
        name: 'Resonance Shard',
        aliases: ['shard', 'crystal'],
        description:
          'The shard pulses in your hand. Its forked base looks as if it belongs in a cradle.',
        placement: { kind: 'location', id: 'loc-cavern' },
        capabilities: ['portable'],
      },
      {
        id: 'obj-anchor',
        name: 'Wormhole Anchor',
        aliases: ['anchor', 'cradle'],
        description: 'A forked cradle waits at its center, two prongs threaded with pale light.',
        placement: { kind: 'location', id: 'loc-nexus' },
        capabilities: ['scenery'],
      },
      {
        id: 'obj-case',
        name: 'Sealed Case',
        aliases: ['case', 'box'],
        description:
          'A weathered metal case rests against the wall. Its simple brass latch lifts easily.',
        placement: { kind: 'location', id: 'loc-gate' },
        capabilities: ['container', 'openable'],
        capacity: 4,
      },
      {
        id: 'obj-token',
        name: 'Brass Token',
        aliases: ['token', 'key'],
        description:
          'A small token marked with a branching star. Its edges are worn smooth by countless hands.',
        placement: { kind: 'inside', id: 'obj-case' },
        capabilities: ['portable'],
      },
      {
        id: 'obj-gate',
        name: 'Brass Gate',
        aliases: ['gate'],
        description: 'A heavy brass gate, with a star-shaped keyhole.',
        placement: { kind: 'connection', id: 'exit-gate' },
        capabilities: ['door', 'openable', 'lockable'],
        locked: true,
        keyId: 'obj-token',
      },
      {
        id: 'obj-chart',
        name: 'Star Chart',
        aliases: ['chart'],
        description: 'Thin silver lines connect stars that no longer exist.',
        readText: 'The observatory listens for a name. Speak Meridian to the Prism Console.',
        placement: { kind: 'location', id: 'loc-archive' },
        capabilities: ['readable'],
      },
      {
        id: 'obj-red',
        name: 'Red Ledger',
        aliases: ['red book', 'book', 'red'],
        description: 'A ledger bound in faded crimson.',
        readText: 'We mapped every destination except the one we needed.',
        placement: { kind: 'location', id: 'loc-archive' },
        capabilities: ['readable', 'portable'],
      },
      {
        id: 'obj-blue',
        name: 'Blue Ledger',
        aliases: ['blue book', 'book', 'blue'],
        description: 'A ledger the color of deep water.',
        readText: 'A door can remember the hand that opens it. A world can remember a name.',
        placement: { kind: 'location', id: 'loc-archive' },
        capabilities: ['readable', 'portable'],
      },
      {
        id: 'obj-console',
        name: 'Prism Console',
        aliases: ['prism', 'console'],
        description:
          'A small prism rests on a speaking plate. The plate is blank; the prism seems to be listening.',
        placement: { kind: 'location', id: 'loc-observatory' },
        capabilities: ['scenery'],
      },
    ],
    characters: [
      {
        id: 'char-archivist',
        name: 'The Archivist',
        aliases: ['archivist'],
        location: 'loc-archive',
        description: 'Ink stains their hands. Their eyes reflect a sky you cannot see.',
        greeting:
          '“You are looking for a way through,” the Archivist says. “Start with the chart. It remembers what I cannot.”',
        fallback: '“Some things even the archive has forgotten.”',
        topics: [
          {
            id: 'topic-observatory',
            name: 'The Observatory',
            aliases: ['observatory', 'stars', 'telescope'],
            response:
              '“Read the name written between the stars. The chart will tell you what the observatory needs to hear.”',
          },
          {
            id: 'topic-gate',
            name: 'The Brass Gate',
            aliases: ['gate'],
            response: '“Some doors ask for a key. Others ask you to listen.”',
          },
        ],
      },
    ],
    variables: [
      {
        id: 'var-wormhole',
        name: 'Wormhole state',
        type: 'enum',
        initial: 'Dormant',
        options: ['Dormant', 'Active'],
      },
      { id: 'var-horizon', name: 'Horizon open', type: 'boolean', initial: false },
    ],
    actions: [
      {
        id: 'speak',
        name: 'Speak',
        aliases: ['say', 'speak'],
        description: 'Speak supplied words to a reachable entity.',
        parameters: [
          { id: 'text', name: 'Words to speak', kind: 'text', scope: 'none' },
          { id: 'target', name: 'Listener', kind: 'entity', scope: 'reachable' },
        ],
        examples: ['say "hello" to listener'],
        refusal: 'Your words fade without an answer.',
      },
    ],
    rules: [
      {
        id: 'rule-activate',
        name: 'Activate wormhole',
        trigger: 'use',
        bindings: { tool: 'obj-shard', target: 'obj-anchor' },
        priority: 10,
        condition: variable('var-wormhole', 'Dormant'),
        effects: [
          effect('set', { ref: 'var-wormhole', value: 'Active' }),
          effect('enable', { ref: 'exit-wormhole', value: true }),
          effect('reveal', { ref: 'exit-wormhole' }),
          effect('print', {
            text: 'You touch the shard to the cradle. Violet light threads between the prongs. Across the chamber, a seam opens into the Echo Dimension.',
          }),
        ],
        otherwise: 'The wormhole is already steady. The shard has done its work.',
      },
      {
        id: 'rule-name',
        name: 'Speak the name',
        trigger: 'speak',
        bindings: { target: 'obj-console' },
        condition: {
          kind: 'compare',
          source: 'argument',
          ref: '',
          key: 'text',
          op: 'normalized',
          value: 'meridian',
        },
        effects: [
          effect('set', { ref: 'var-horizon', value: true }),
          effect('enable', { ref: 'exit-seam', value: true }),
          effect('reveal', { ref: 'exit-seam' }),
          effect('print', {
            text: '“Meridian.” The prism fills with morning light. A seam opens in the edge of the sky, and beyond it you hear the sea.',
          }),
        ],
        otherwise: 'The prism returns your words as a faint, unfinished echo.',
      },
      {
        id: 'rule-home',
        name: 'Homeward',
        phase: 'event',
        trigger: 'enter',
        bindings: { to: 'loc-shore' },
        once: true,
        condition: always(),
        effects: [
          effect('end', {
            ref: 'homeward',
            text: 'You step onto the shore. Behind you, the impossible sky folds itself into a single point of light. Ahead, a familiar road rises from the sand.\n\nYou have found your way home.',
          }),
        ],
      },
    ],
    templates: [
      { id: 'type-container', name: 'Container', capabilities: ['container', 'openable'] },
      { id: 'type-item', name: 'Portable item', capabilities: ['portable'] },
      { id: 'type-readable', name: 'Readable object', capabilities: ['readable'] },
    ],
  });
}
export const walkthrough = [
  'take lantern',
  'go stone arch',
  'take shard',
  'go stone arch',
  'go spiral stair',
  'open case',
  'take token from case',
  'unlock brass gate with token',
  'open brass gate',
  'go brass gate',
  'read star chart',
  'go brass gate',
  'go spiral stair',
  'use shard on anchor',
  'go wormhole',
  'go silver thread',
  'say "Meridian" to prism console',
  'go horizon seam',
];
