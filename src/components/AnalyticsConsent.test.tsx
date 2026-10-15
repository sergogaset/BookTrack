import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AnalyticsConsent } from './AnalyticsConsent';
import { setConsent } from '../analytics';

vi.mock('../analytics', () => ({ readConsent: () => null, setConsent: vi.fn() }));
describe('Analytics consent controls', () => {
  it('offers refusal and allows changing the saved choice', async () => {
    render(<AnalyticsConsent />);
    expect(setConsent).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Отказаться' }));
    expect(setConsent).toHaveBeenCalledWith('declined');
    await userEvent.click(screen.getByRole('button', { name: 'Настройки аналитики: отключена' }));
    await userEvent.click(screen.getByRole('button', { name: 'Разрешить аналитику' }));
    expect(setConsent).toHaveBeenLastCalledWith('accepted');
    expect(screen.getByRole('button', { name: 'Настройки аналитики: разрешена' })).toBeVisible();
  });
});
