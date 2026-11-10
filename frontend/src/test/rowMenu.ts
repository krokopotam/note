import { screen, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';

/**
 * Test helper: reach an action that lives behind a row's three dots.
 *
 * Every list in the apps hides its verbs the same way, so the tests open them the
 * same way — and a test that forgets the click fails where a person would notice.
 */
export async function openRowMenu(scope: HTMLElement, label: string | RegExp): Promise<HTMLElement> {
  await userEvent.click(within(scope).getByRole('button', { name: label }));
  return screen.findByRole('menu');
}

/** Open the menu of `label` and choose the item `item`. */
export async function pickRowAction(
  scope: HTMLElement,
  label: string | RegExp,
  item: string,
): Promise<void> {
  const menu = await openRowMenu(scope, label);
  await userEvent.click(within(menu).getByRole('menuitem', { name: item }));
}
