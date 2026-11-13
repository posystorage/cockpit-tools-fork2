import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import type { AnnouncementState } from '../types/announcement';
import {
  APIKEY_FUN_CAMPAIGN,
  filterApiKeyFunCampaignAnnouncement,
  getApiKeyFunCampaignRefreshDelay,
  isApiKeyFunCampaignActive,
} from './apiKeyFunCampaign.ts';
import { APIKEY_FUN_REGISTER_URL, normalizeApiKeyFunOfficialUrl } from './apikeyFunLinks.ts';

test('campaign includes all of November 1–11 in Beijing time and excludes both outer boundaries', () => {
  for (const [time, expected] of [
    ['2026-10-31T23:59:59.999+08:00', false],
    ['2026-11-01T00:00:00+08:00', true],
    ['2026-11-11T23:59:59.999+08:00', true],
    ['2026-11-12T00:00:00+08:00', false],
    ['2027-11-01T00:00:00+08:00', false],
  ] as const) {
    assert.equal(isApiKeyFunCampaignActive(Date.parse(time)), expected, time);
  }
});

test('campaign uses absolute instants, independent of the computer timezone', () => {
  assert.equal(isApiKeyFunCampaignActive(Date.parse('2026-10-31T16:00:00Z')), true);
  assert.equal(isApiKeyFunCampaignActive(Date.parse('2026-10-31T09:00:00-07:00')), true);
  assert.equal(isApiKeyFunCampaignActive(Date.parse('2026-11-11T16:00:00Z')), false);
});

test('refresh wakes at a boundary and caps clock-change detection at one minute', () => {
  const start = Date.parse(APIKEY_FUN_CAMPAIGN.startsAt);
  const end = Date.parse(APIKEY_FUN_CAMPAIGN.expiresAt);
  assert.equal(getApiKeyFunCampaignRefreshDelay(start - 1), 1);
  assert.equal(getApiKeyFunCampaignRefreshDelay(end - 1234), 1234);
  for (const now of [start - 86_400_000, start, end, end + 86_400_000]) {
    assert.equal(getApiKeyFunCampaignRefreshDelay(now), 60_000);
  }
});

test('cached campaign announcement and unread badge disappear outside the period without mutating other notices', () => {
  const notice = (id: string) => ({ id, type: 'info', title: id, summary: '', content: '', priority: 1, targetVersions: '*', popup: false, createdAt: APIKEY_FUN_CAMPAIGN.startsAt });
  const campaign = notice(APIKEY_FUN_CAMPAIGN.id);
  const other = notice('other');
  const state: AnnouncementState = { announcements: [campaign, other], unreadIds: [campaign.id, other.id], popupAnnouncement: campaign };
  assert.equal(filterApiKeyFunCampaignAnnouncement(state, true), state);
  assert.deepEqual(filterApiKeyFunCampaignAnnouncement(state, false), { announcements: [other], unreadIds: [other.id], popupAnnouncement: null });
  assert.equal(state.announcements.length, 2);
  assert.equal(filterApiKeyFunCampaignAnnouncement({ ...state, popupAnnouncement: other }, false).popupAnnouncement, other);
});

test('fork bundled announcements contain no campaigns, ads, sponsors or remote feature switches', () => {
  const feed = JSON.parse(readFileSync(new URL('../../announcements.json', import.meta.url), 'utf8'));
  assert.deepEqual(feed.announcements, []);
  assert.deepEqual(feed.topRightAds, []);
  assert.deepEqual(feed.forceRefreshVersions, []);
  assert.equal(feed.topRightAd, null);
  assert.equal(feed.topRightAdsEnabled, false);
  assert.equal(feed.apiRelayEnabled, false);
  assert.equal(feed.sponsorModule.enabled, false);
  assert.equal(feed.sponsorModule.entryVisible, false);
  assert.deepEqual(feed.sponsorModule.sponsors, []);
});

test('fork does not substitute an affiliate registration URL for user input', () => {
  assert.equal(new URL(APIKEY_FUN_CAMPAIGN.url).searchParams.get('aff'), 'COCKPIT');
  assert.equal(normalizeApiKeyFunOfficialUrl(APIKEY_FUN_CAMPAIGN.url), APIKEY_FUN_CAMPAIGN.url);
  assert.equal(APIKEY_FUN_REGISTER_URL, '');
  assert.equal(normalizeApiKeyFunOfficialUrl('https://relay.example/register'), 'https://relay.example/register');
});
