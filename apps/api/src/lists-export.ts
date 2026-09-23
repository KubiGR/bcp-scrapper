import type { ListExportFormat } from '@bcp/shared';
import type { ExportedList, MissingList } from './repo/lists';

const RULE = '='.repeat(72);

/**
 * A plain-text file with every list, one titled block each, ready to paste or print. The header
 * says how complete it is and names the players whose list is missing.
 */
export function listsToText(
  eventName: string,
  lists: ExportedList[],
  missing: MissingList[] = [],
): string {
  const players = lists.length + missing.length;
  const header = [
    eventName,
    `${lists.length} of ${players} players' army lists`,
    ...(missing.length > 0 ? [`Missing: ${missing.map((entry) => entry.player).join(', ')}`] : []),
  ].join('\n');
  const blocks = lists.map((list) => {
    const title = [
      list.placing === null ? null : `#${list.placing}`,
      list.player,
      list.team,
      list.faction,
    ]
      .filter((part): part is string => part !== null)
      .join(' · ');
    return `${RULE}\n${title}\n${RULE}\n${list.text ?? '(empty list)'}\n`;
  });
  return [`${header}\n`, ...blocks].join('\n');
}

/** A download name made only of [a-z0-9-], so it's safe inside Content-Disposition. */
export function exportFileName(eventName: string, format: ListExportFormat): string {
  const slug = eventName
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug === '' ? 'event' : slug}-lists.${format}`;
}
