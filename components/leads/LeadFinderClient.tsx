'use client';

import Link from 'next/link';
import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { canonicalLeadKeys } from '@/lib/leads/canonical';
import { businessFocusOptions } from '@/lib/leads/search-options';

type CountryOption = {
  id: string;
  label: string;
};

type CityOption = {
  id: string;
  label: string;
};

type LeadRow = {
  id: string;
  searchId: string;
  companyId: string | null;
  name: string;
  category: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  latitude: number | null;
  longitude: number | null;
  sourceUrl: string;
  fingerprint: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type SearchRow = {
  id: string;
  keyword: string;
  area: string;
  requestedLimit: number;
  enrichEmails: boolean;
  status: string;
  foundCount: number;
  skippedCount: number;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
};

type StreamEvent =
  | { type: 'started'; runId: string; message: string }
  | { type: 'progress'; message: string; current?: number; total?: number; skippedCount?: number }
  | { type: 'lead'; lead: LeadRow; leadKeys?: string[] }
  | { type: 'complete'; runId: string; foundCount: number; skippedCount: number; message: string }
  | { type: 'error'; runId?: string; message: string };

type ImportResult = {
  leadId: string;
  companyId?: string;
  outcome: string;
  error?: string;
};

type CsvImportResult = {
  leads?: LeadRow[];
  search?: SearchRow;
  importedCount?: number;
  skippedCount?: number;
  error?: string;
};

type SearchTarget = {
  keyword: string;
  area: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function statusClass(status: string) {
  if (status === 'imported' || status === 'completed') return 'bg-emerald-100 text-emerald-800';
  if (status === 'ignored' || status === 'cancelled') return 'bg-slate-100 text-slate-700';
  if (status === 'failed') return 'bg-rose-100 text-rose-800';
  return 'bg-indigo-100 text-indigo-800';
}

function normalizeLeadText(value?: string | null) {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function leadDisplayKey(lead: LeadRow) {
  const keys = canonicalLeadKeys(lead);
  if (keys[0]) return keys[0];
  return `name-address:${normalizeLeadText(lead.name)}|${normalizeLeadText(lead.address)}`;
}

function leadDisplayRank(lead: LeadRow) {
  if (lead.status === 'imported') return 4;
  if (lead.status === 'new') return 3;
  if (lead.status === 'ignored') return 2;
  return 1;
}

function dedupeLeadRows(rows: LeadRow[]) {
  const byKey = new Map<string, LeadRow>();
  for (const lead of rows) {
    const key = leadDisplayKey(lead);
    const current = byKey.get(key);
    if (!current || leadDisplayRank(lead) > leadDisplayRank(current)) {
      byKey.set(key, lead);
    }
  }
  return [...byKey.values()];
}

export function LeadFinderClient({
  countries,
  defaultCountryId,
  initialCities,
  initialLeads,
  initialSearches
}: {
  countries: CountryOption[];
  defaultCountryId: string;
  initialCities: CityOption[];
  initialLeads: LeadRow[];
  initialSearches: SearchRow[];
}) {
  const [leads, setLeads] = useState(initialLeads);
  const [searches, setSearches] = useState(initialSearches);
  const [countryId, setCountryId] = useState(defaultCountryId);
  const [availableCities, setAvailableCities] = useState(initialCities);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [cityQuery, setCityQuery] = useState('');
  const [focusId, setFocusId] = useState<string>(businessFocusOptions[0].id);
  const [builderKeyword, setBuilderKeyword] = useState<string>(businessFocusOptions[0].keywords[0]);
  const [builderAreas, setBuilderAreas] = useState<Set<string>>(
    new Set(initialCities.slice(0, 5).map((city) => city.label))
  );
  const [limit, setLimit] = useState(10);
  const [enrichEmails, setEnrichEmails] = useState(false);
  const [headed, setHeaded] = useState(false);
  const [filter, setFilter] = useState('new');
  const [cityFilter, setCityFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [csvImporting, setCsvImporting] = useState(false);
  const [progress, setProgress] = useState('Ready to search.');
  const [progressValue, setProgressValue] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<LeadRow | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const cancellingRef = useRef(false);
  const cancelLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cityRequestRef = useRef(0);
  const cityAbortRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    if (cancelLockTimerRef.current) clearTimeout(cancelLockTimerRef.current);
    abortRef.current?.abort();
    void readerRef.current?.cancel();
    cityAbortRef.current?.abort();
  }, []);

  const dedupedLeads = useMemo(() => dedupeLeadRows(leads), [leads]);
  const cityOptions = useMemo(() => {
    return [...new Set(dedupedLeads.map((lead) => lead.city).filter((city): city is string => Boolean(city)))]
      .sort((left, right) => left.localeCompare(right));
  }, [dedupedLeads]);
  const visibleLeads = useMemo(
    () => {
      const byStatus = filter === 'all' ? dedupedLeads : dedupedLeads.filter((lead) => lead.status === filter);
      return cityFilter ? byStatus.filter((lead) => lead.city === cityFilter) : byStatus;
    },
    [cityFilter, dedupedLeads, filter]
  );
  const selectable = visibleLeads.filter((lead) => lead.status !== 'imported');
  const selectedCount = [...selected].filter((id) => dedupedLeads.some((lead) => lead.id === id)).length;
  const exportParams = new URLSearchParams();
  if (filter !== 'all') exportParams.set('status', filter);
  if (cityFilter) exportParams.set('city', cityFilter);
  const exportQuery = exportParams.toString();
  const exportUrl = exportQuery ? `/api/leads/export?${exportQuery}` : '/api/leads/export';
  const selectedCountry = countries.find((country) => country.id === countryId) ?? countries[0];
  const selectedFocus = businessFocusOptions.find((focus) => focus.id === focusId) ?? businessFocusOptions[0];
  const matchingCities = useMemo(() => {
    const query = cityQuery.trim().toLocaleLowerCase();
    if (!query) return availableCities;
    return availableCities.filter((city) => city.label.toLocaleLowerCase().includes(query));
  }, [availableCities, cityQuery]);
  const displayedCities = matchingCities.slice(0, 200);

  function releaseCancelLock(delay = 900) {
    if (cancelLockTimerRef.current) clearTimeout(cancelLockTimerRef.current);
    cancelLockTimerRef.current = setTimeout(() => {
      cancellingRef.current = false;
      setCancelling(false);
      cancelLockTimerRef.current = null;
    }, delay);
  }

  function applyStreamEvent(
    event: StreamEvent,
    target: SearchTarget,
    batchPosition?: { current: number; total: number }
  ) {
    const prefix = batchPosition && batchPosition.total > 1
      ? `City ${batchPosition.current}/${batchPosition.total} · `
      : '';
    if (event.type === 'progress') {
      setProgress(`${prefix}${event.message}`);
      setProgressValue(event.current ?? 0);
      setProgressTotal(event.total ?? 0);
      return;
    }
    if (event.type === 'lead') {
      setLeads((current) => [event.lead, ...current.filter((lead) => lead.id !== event.lead.id)]);
      return;
    }
    if (event.type === 'complete') {
      setProgress(`${prefix}${event.message}`);
      setSearches((current) => [{
        id: event.runId,
        keyword: target.keyword,
        area: target.area,
        requestedLimit: limit,
        enrichEmails,
        status: 'completed',
        foundCount: event.foundCount,
        skippedCount: event.skippedCount,
        error: null,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      }, ...current.filter((item) => item.id !== event.runId)].slice(0, 8));
      return;
    }
    if (event.type === 'error') {
      setError(event.message);
      setProgress(`${prefix}${event.message}`);
    }
  }

  async function runSearchTargets(targets: SearchTarget[]) {
    if (running || cancellingRef.current) return;
    if (cancelLockTimerRef.current) clearTimeout(cancelLockTimerRef.current);
    cancellingRef.current = false;
    setCancelling(false);
    setRunning(true);
    setError(null);
    setNotice(null);
    setProgress('Starting browser…');
    setProgressValue(0);
    setProgressTotal(0);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let completed = 0;
      let totalFound = 0;
      let totalSkipped = 0;
      const batchSeenKeys = new Set(dedupedLeads.flatMap((lead) => canonicalLeadKeys(lead)));
      for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
        const target = targets[targetIndex];
        if (controller.signal.aborted) break;
        const response = await fetch('/api/leads/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            keyword: target.keyword,
            area: target.area,
            limit,
            enrichEmails,
            headed,
            excludeKeys: [...batchSeenKeys].slice(-500)
          }),
          signal: controller.signal
        });
        if (!response.ok || !response.body) {
          const payload = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(payload.error ?? 'Could not start the search.');
        }

        const reader = response.body.getReader();
        readerRef.current = reader;
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.trim()) continue;
            const streamEvent = JSON.parse(line) as StreamEvent;
            applyStreamEvent(streamEvent, target, {
              current: targetIndex + 1,
              total: targets.length
            });
            if (streamEvent.type === 'lead') {
              const leadKeys = streamEvent.leadKeys ?? canonicalLeadKeys(streamEvent.lead);
              leadKeys.forEach((key) => batchSeenKeys.add(key));
            }
            if (streamEvent.type === 'complete') {
              totalFound += streamEvent.foundCount;
              totalSkipped += streamEvent.skippedCount;
            }
            if (streamEvent.type === 'error') throw new Error(streamEvent.message);
          }
          if (done) break;
        }
        if (buffer.trim()) {
          const streamEvent = JSON.parse(buffer) as StreamEvent;
          applyStreamEvent(streamEvent, target, {
            current: targetIndex + 1,
            total: targets.length
          });
          if (streamEvent.type === 'lead') {
            const leadKeys = streamEvent.leadKeys ?? canonicalLeadKeys(streamEvent.lead);
            leadKeys.forEach((key) => batchSeenKeys.add(key));
          }
          if (streamEvent.type === 'complete') {
            totalFound += streamEvent.foundCount;
            totalSkipped += streamEvent.skippedCount;
          }
          if (streamEvent.type === 'error') throw new Error(streamEvent.message);
        }
        readerRef.current = null;
        completed += 1;
      }
      if (!controller.signal.aborted) {
        setNotice(`Completed ${completed} ${completed === 1 ? 'area' : 'areas'} and found ${totalFound} new unique leads. Skipped ${totalSkipped} duplicates.`);
      }
    } catch (searchError) {
      if (controller.signal.aborted || (searchError instanceof DOMException && searchError.name === 'AbortError')) {
        setProgress('Search cancelled.');
        setNotice('Search cancelled. Leads already found remain in your inbox.');
      } else {
        setError(searchError instanceof Error ? searchError.message : 'Search failed.');
      }
    } finally {
      abortRef.current = null;
      readerRef.current = null;
      setRunning(false);
      if (cancellingRef.current) releaseCancelLock();
    }
  }

  async function changeCountry(nextCountryId: string) {
    const country = countries.find((option) => option.id === nextCountryId) ?? countries[0];
    if (!country) return;
    const requestId = cityRequestRef.current + 1;
    cityAbortRef.current?.abort();
    const cityController = new AbortController();
    cityAbortRef.current = cityController;
    cityRequestRef.current = requestId;
    setCountryId(country.id);
    setAvailableCities([]);
    setBuilderAreas(new Set());
    setCityQuery('');
    setCitiesLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/locations/cities?country=${encodeURIComponent(country.id)}`, {
        signal: cityController.signal
      });
      const payload = await response.json() as { cities?: CityOption[]; error?: string };
      if (!response.ok || !payload.cities) throw new Error(payload.error ?? 'Could not load cities.');
      if (cityRequestRef.current !== requestId) return;
      setAvailableCities(payload.cities);
      const defaults = payload.cities.slice(0, 5).map((city) => city.label);
      setBuilderAreas(new Set(defaults));
    } catch (cityError) {
      if (cityController.signal.aborted) return;
      if (cityRequestRef.current === requestId) {
        setError(cityError instanceof Error ? cityError.message : 'Could not load cities.');
      }
    } finally {
      if (cityRequestRef.current === requestId && !cityController.signal.aborted) setCitiesLoading(false);
    }
  }

  function changeFocus(nextFocusId: string) {
    const focus = businessFocusOptions.find((option) => option.id === nextFocusId) ?? businessFocusOptions[0];
    setFocusId(focus.id);
    setBuilderKeyword(focus.keywords[0]);
    setError(null);
  }

  function toggleBuilderArea(value: string) {
    if (!builderAreas.has(value) && builderAreas.size >= 10) {
      setError('Select at most 10 cities per batch.');
      return;
    }
    setBuilderAreas((current) => {
      const next = new Set(current);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  }

  function selectVisibleCities() {
    setBuilderAreas(new Set(matchingCities.slice(0, 10).map((city) => city.label)));
  }

  function useBuilderSelection() {
    if (running || cancellingRef.current) return;
    const areas = [...builderAreas];
    if (!builderKeyword || !areas.length) {
      setError('Select one business keyword and at least one city.');
      return;
    }
    if (areas.length * limit > 100) {
      setError('This batch is larger than 100 potential leads. Reduce the cities or the per-city limit.');
      return;
    }
    void runSearchTargets(areas.map((selectedArea) => ({
      keyword: builderKeyword,
      area: selectedArea
    })));
  }

  function cancelSearch() {
    if (cancellingRef.current) return;
    cancellingRef.current = true;
    setCancelling(true);
    abortRef.current?.abort();
    void readerRef.current?.cancel().catch(() => undefined);
    setProgress('Cancelling search…');
    setNotice('Search cancelled. Leads already found remain in your inbox.');
    releaseCancelLock(1_800);
  }

  function toggleLead(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    const ids = selectable.map((lead) => lead.id);
    const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
    setSelected((current) => {
      const next = new Set(current);
      ids.forEach((id) => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  }

  async function changeStatus(lead: LeadRow, status: 'new' | 'ignored') {
    setError(null);
    const response = await fetch(`/api/leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    const payload = await response.json() as { lead?: LeadRow; error?: string };
    if (!response.ok || !payload.lead) {
      setError(payload.error ?? 'Could not update the lead.');
      return;
    }
    setLeads((current) => current.map((item) => item.id === lead.id ? payload.lead! : item));
    setSelected((current) => {
      const next = new Set(current);
      if (status === 'ignored') next.delete(lead.id);
      return next;
    });
  }

  async function removeLead(lead: LeadRow) {
    if (!window.confirm(`Remove lead "${lead.name}" from the Lead Inbox? This cannot be undone.`)) {
      return;
    }

    setError(null);
    const response = await fetch(`/api/leads/${lead.id}`, { method: 'DELETE' });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? 'Could not remove the lead.');
      return;
    }
    setLeads((current) => current.filter((item) => item.id !== lead.id));
    setSelected((current) => {
      const next = new Set(current);
      next.delete(lead.id);
      return next;
    });
    setNotice('Lead removed from the inbox.');
  }

  async function importCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setCsvImporting(true);
    setError(null);
    setNotice('Importing CSV into Lead Inbox…');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/leads/import-csv', {
        method: 'POST',
        body: formData
      });
      const payload = await response.json() as CsvImportResult;
      if (!response.ok || !payload.leads || !payload.search) {
        throw new Error(payload.error ?? 'Could not import the CSV file.');
      }

      setLeads((current) => [
        ...payload.leads!,
        ...current.filter((lead) => !payload.leads!.some((item) => item.id === lead.id))
      ]);
      setSearches((current) => [payload.search!, ...current.filter((item) => item.id !== payload.search!.id)].slice(0, 8));
      setFilter('new');
      setNotice(`Imported ${payload.importedCount ?? payload.leads.length} leads into Lead Inbox. Skipped ${payload.skippedCount ?? 0} duplicate/empty rows.`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Could not import the CSV file.');
    } finally {
      setCsvImporting(false);
      if (csvInputRef.current) csvInputRef.current.value = '';
    }
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setSavingEdit(true);
    setError(null);
    try {
      const response = await fetch(`/api/leads/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editing.name,
          category: editing.category ?? '',
          address: editing.address ?? '',
          city: editing.city ?? '',
          phone: editing.phone ?? '',
          email: editing.email ?? '',
          website: editing.website ?? ''
        })
      });
      const payload = await response.json() as { lead?: LeadRow; error?: string };
      if (!response.ok || !payload.lead) throw new Error(payload.error ?? 'Could not save changes.');
      setLeads((current) => current.map((lead) => lead.id === editing.id ? payload.lead! : lead));
      setEditing(null);
      setNotice('Lead updated.');
    } catch (editError) {
      setError(editError instanceof Error ? editError.message : 'Could not save changes.');
    } finally {
      setSavingEdit(false);
    }
  }

  async function importSelected() {
    const leadIds = [...selected].filter((id) => dedupedLeads.some((lead) => lead.id === id));
    if (!leadIds.length) return;
    setError(null);
    setNotice('Importing selected leads…');
    const response = await fetch('/api/leads/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadIds })
    });
    const payload = await response.json() as {
      importedCount?: number;
      results?: ImportResult[];
      error?: string;
    };
    if (!response.ok || !payload.results) {
      setError(payload.error ?? 'Could not import the selected leads.');
      return;
    }

    const resultMap = new Map(payload.results.map((result) => [result.leadId, result]));
    setLeads((current) => current.map((lead) => {
      const result = resultMap.get(lead.id);
      if (!result || result.outcome === 'failed') return lead;
      return { ...lead, status: 'imported', companyId: result.companyId ?? lead.companyId };
    }));
    setSelected(new Set());
    const failed = payload.results.filter((result) => result.outcome === 'failed').length;
    setNotice(`Imported or matched ${payload.importedCount ?? 0} leads${failed ? `; ${failed} failed` : ''}.`);
  }

  function updateEditing(field: keyof LeadRow, value: string) {
    setEditing((current) => current ? { ...current, [field]: value } : current);
  }

  return (
    <div className="space-y-6">
      <section className="card overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600 via-violet-600 to-slate-950 p-5 text-white sm:p-6">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-indigo-200">Google Maps Search Builder</p>
            <h2 className="mt-2 text-2xl font-black">Choose a country, cities, and a Maps-ready business keyword</h2>
            <p className="mt-2 text-sm leading-6 text-indigo-100">
              Every keyword below is prepared for Google Maps. Choose your targets, then review all results in the Lead Inbox.
            </p>
          </div>
        </div>

        <div className="grid gap-6 p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="label">1. Country</span>
              <select className="input" value={countryId} onChange={(event) => changeCountry(event.target.value)}>
                {countries.map((country) => (
                  <option key={country.id} value={country.id}>{country.label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="label">2. Business focus</span>
              <select className="input" value={focusId} onChange={(event) => changeFocus(event.target.value)}>
                {businessFocusOptions.map((focus) => (
                  <option key={focus.id} value={focus.id}>{focus.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <fieldset>
              <legend className="text-sm font-black text-slate-950">3. Choose a ready business keyword</legend>
              <p className="mt-1 text-xs leading-5 text-slate-500">These are business categories, not job titles.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {selectedFocus.keywords.map((suggestion) => (
                  <label
                    key={suggestion}
                    className={`cursor-pointer rounded-full border px-3 py-2 text-sm font-bold transition ${
                      builderKeyword === suggestion
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300'
                    }`}
                  >
                    <input
                      className="sr-only"
                      type="radio"
                      name="builder-keyword"
                      value={suggestion}
                      checked={builderKeyword === suggestion}
                      onChange={() => setBuilderKeyword(suggestion)}
                    />
                    {suggestion}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-black text-slate-950">4. Select cities in {selectedCountry?.label ?? 'country'}</legend>
              <p className="mt-1 text-xs leading-5 text-slate-500">Search the offline city list and select up to 10 cities.</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  className="input"
                  value={cityQuery}
                  onChange={(event) => setCityQuery(event.target.value)}
                  placeholder="Search cities…"
                  aria-label="Search cities"
                  disabled={citiesLoading}
                />
                <button className="btn-secondary shrink-0" type="button" onClick={selectVisibleCities} disabled={citiesLoading || matchingCities.length === 0}>
                  Select first 10
                </button>
                <button className="btn-secondary shrink-0" type="button" onClick={() => setBuilderAreas(new Set())} disabled={builderAreas.size === 0}>
                  Clear
                </button>
              </div>
              <div className="mt-4 flex max-h-64 flex-wrap gap-2 overflow-y-auto pr-2">
                {citiesLoading ? <p className="text-sm font-semibold text-slate-500">Loading cities…</p> : displayedCities.map((city) => {
                  const suggestion = city.label;
                  return (
                  <label
                    key={suggestion}
                    className={`cursor-pointer rounded-full border px-3 py-2 text-sm font-bold transition ${
                      builderAreas.has(suggestion)
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300'
                    }`}
                  >
                    <input
                      className="sr-only"
                      type="checkbox"
                      checked={builderAreas.has(suggestion)}
                      onChange={() => toggleBuilderArea(suggestion)}
                    />
                    {builderAreas.has(suggestion) ? '✓ ' : ''}{suggestion}
                  </label>
                  );
                })}
                {!citiesLoading && displayedCities.length === 0 ? (
                  <p className="text-sm text-slate-500">No cities match this search.</p>
                ) : null}
              </div>
              {!citiesLoading && matchingCities.length > displayedCities.length ? (
                <p className="mt-3 text-xs text-slate-500">
                  Showing the first {displayedCities.length} of {matchingCities.length} cities. Type a city name to narrow the list.
                </p>
              ) : null}
            </fieldset>
          </div>

          <div className="grid gap-4 rounded-2xl bg-slate-50 p-4 lg:grid-cols-[10rem_1fr_auto] lg:items-end">
            <label className="space-y-2">
              <span className="label">Limit per city</span>
              <input
                className="input bg-white"
                type="number"
                min={1}
                max={50}
                value={limit}
                onChange={(event) => setLimit(Number(event.target.value))}
              />
            </label>
            <div>
              <p className="font-black text-slate-950">
                {builderAreas.size} {builderAreas.size === 1 ? 'city' : 'cities'} selected · up to {builderAreas.size * limit} leads
              </p>
              <p className="mt-1 text-xs text-slate-500">Nothing is auto-imported; results go to the Lead Inbox first.</p>
              <div className="mt-3 flex flex-wrap gap-5">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <input type="checkbox" checked={enrichEmails} onChange={(event) => setEnrichEmails(event.target.checked)} />
                  Find public emails on company websites
                </label>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <input type="checkbox" checked={headed} onChange={(event) => setHeaded(event.target.checked)} />
                  Show browser (useful if Google requests verification)
                </label>
              </div>
            </div>
            {running ? (
              <button
                className="btn-danger"
                type="button"
                onClick={cancelSearch}
                disabled={cancelling}
              >
                {cancelling ? 'Cancelling…' : 'Cancel'}
              </button>
            ) : (
              <button
                className="btn-primary"
                type="button"
                onClick={useBuilderSelection}
                disabled={cancelling || !builderKeyword || builderAreas.size === 0}
              >
                {cancelling ? 'Cancelling…' : 'Search Maps'}
              </button>
            )}
          </div>

          <div className="rounded-2xl bg-slate-950 p-4 text-white">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-bold">{progress}</span>
              {progressTotal > 0 ? <span className="text-slate-300">{progressValue}/{progressTotal}</span> : null}
            </div>
            {running ? (
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-indigo-400 transition-all"
                  style={{ width: progressTotal ? `${Math.max(5, (progressValue / progressTotal) * 100)}%` : '12%' }}
                />
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {error ? <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p> : null}
      {notice ? <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{notice}</p> : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_18rem]">
        <section className="card overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-950">Lead Inbox</h2>
              <p className="mt-1 text-sm text-slate-600">Review, edit, and import only the companies you want.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select className="input w-auto py-2" value={filter} onChange={(event) => setFilter(event.target.value)}>
                <option value="new">New</option>
                <option value="imported">Imported</option>
                <option value="ignored">Ignored</option>
                <option value="all">All</option>
              </select>
              <select className="input w-auto py-2" value={cityFilter} onChange={(event) => setCityFilter(event.target.value)}>
                <option value="">All cities</option>
                {cityOptions.map((city) => <option key={city} value={city}>{city}</option>)}
              </select>
              <a className="btn-secondary" href={exportUrl}>Export CSV</a>
              <input
                ref={csvInputRef}
                className="sr-only"
                type="file"
                accept=".csv,text/csv"
                onChange={importCsv}
              />
              <button
                className="btn-secondary"
                type="button"
                onClick={() => csvInputRef.current?.click()}
                disabled={csvImporting || running}
              >
                {csvImporting ? 'Importing…' : 'Import CSV'}
              </button>
              <button className="btn-primary" type="button" disabled={!selectedCount} onClick={importSelected}>
                Import selected ({selectedCount})
              </button>
            </div>
          </div>

          {visibleLeads.length === 0 ? (
            <div className="p-10 text-center">
              <p className="font-black text-slate-900">No leads in this view</p>
              <p className="mt-2 text-sm text-slate-500">Run a Google Maps search or choose another filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="app-table min-w-[70rem]">
                <thead>
                  <tr>
                    <th className="table-th">
                      <input
                        type="checkbox"
                        aria-label="Select all visible leads"
                        checked={selectable.length > 0 && selectable.every((lead) => selected.has(lead.id))}
                        onChange={toggleAll}
                      />
                    </th>
                    <th className="table-th">Company</th>
                    <th className="table-th">Contact</th>
                    <th className="table-th">Maps data</th>
                    <th className="table-th">Status</th>
                    <th className="table-th">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleLeads.map((lead) => (
                    <tr key={lead.id}>
                      <td className="table-td align-top">
                        {lead.status !== 'imported' ? (
                          <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggleLead(lead.id)} aria-label={`Select ${lead.name}`} />
                        ) : null}
                      </td>
                      <td className="table-td align-top">
                        <p className="font-black text-slate-950">{lead.name}</p>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs">
                          <span className="text-slate-500">{lead.category || 'Uncategorized'}</span>
                          {lead.city ? <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-bold text-indigo-700">{lead.city}</span> : null}
                        </div>
                        <p className="mt-2 max-w-xs text-xs leading-5 text-slate-600">{lead.address || 'No address'}</p>
                      </td>
                      <td className="table-td align-top">
                        {lead.phone ? <a className="block text-sm text-slate-700" href={`tel:${lead.phone}`}>{lead.phone}</a> : <span className="text-xs text-slate-400">No phone</span>}
                        {lead.email ? <a className="mt-1 block text-sm font-bold text-indigo-600" href={`mailto:${lead.email}`}>{lead.email}</a> : <p className="mt-1 text-xs text-slate-400">No public email</p>}
                        {lead.website ? <a className="mt-2 block max-w-xs truncate text-xs font-bold text-indigo-600" href={lead.website} target="_blank" rel="noreferrer">{lead.website}</a> : null}
                      </td>
                      <td className="table-td align-top">
                        <p className="font-bold text-slate-900">{lead.rating ?? '—'} ★</p>
                        <p className="mt-1 text-xs text-slate-500">{lead.reviewCount !== null ? `${lead.reviewCount} reviews` : 'Review count unavailable'}</p>
                        <a className="mt-2 block text-xs font-bold text-indigo-600" href={lead.sourceUrl} target="_blank" rel="noreferrer">Open Google Maps</a>
                      </td>
                      <td className="table-td align-top">
                        <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusClass(lead.status)}`}>{lead.status}</span>
                      </td>
                      <td className="table-td align-top">
                        <div className="flex max-w-[13rem] flex-wrap gap-2">
                          {lead.status !== 'imported' ? <button className="btn-secondary" type="button" onClick={() => setEditing({ ...lead })}>Edit</button> : null}
                          {lead.status === 'ignored' ? (
                            <button className="btn-secondary" type="button" onClick={() => changeStatus(lead, 'new')}>Restore</button>
                          ) : lead.status !== 'imported' ? (
                            <button className="btn-danger" type="button" onClick={() => changeStatus(lead, 'ignored')}>Ignore</button>
                          ) : null}
                          <button className="btn-danger" type="button" onClick={() => removeLead(lead)}>Remove</button>
                          {lead.companyId ? (
                            <>
                              <Link className="btn-secondary" href={`/companies?edit=${lead.companyId}`}>Company</Link>
                              <Link className="btn-primary" href={`/ai-generator?companyId=${lead.companyId}`}>Generate email</Link>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="card h-fit p-5">
          <h2 className="font-black text-slate-950">Recent searches</h2>
          <div className="mt-4 space-y-3">
            {searches.length === 0 ? <p className="text-sm text-slate-500">No searches yet.</p> : searches.map((search) => (
              <div key={search.id} className="rounded-2xl border border-slate-100 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-black text-slate-900">{search.keyword}</p>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${statusClass(search.status)}`}>{search.status}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {search.area} · {search.foundCount}/{search.requestedLimit} new · {search.skippedCount} skipped
                </p>
                <p className="mt-2 text-[11px] text-slate-400">{formatDate(search.createdAt)}</p>
                {search.error ? <p className="mt-2 text-xs text-rose-600">{search.error}</p> : null}
              </div>
            ))}
          </div>
        </aside>
      </div>

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation">
          <form
            onSubmit={saveEdit}
            className="card max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-lead-title"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="edit-lead-title" className="text-xl font-black text-slate-950">Edit lead</h2>
                <p className="mt-1 text-sm text-slate-600">Clean the data before importing it into Companies.</p>
              </div>
              <button className="btn-secondary" type="button" onClick={() => setEditing(null)}>Close</button>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 sm:col-span-2">
                <span className="label">Company name</span>
                <input className="input" value={editing.name} onChange={(event) => updateEditing('name', event.target.value)} required />
              </label>
              <label className="space-y-2">
                <span className="label">Category</span>
                <input className="input" value={editing.category ?? ''} onChange={(event) => updateEditing('category', event.target.value)} />
              </label>
              <label className="space-y-2">
                <span className="label">City tag</span>
                <input className="input" value={editing.city ?? ''} onChange={(event) => updateEditing('city', event.target.value)} />
              </label>
              <label className="space-y-2">
                <span className="label">Phone</span>
                <input className="input" value={editing.phone ?? ''} onChange={(event) => updateEditing('phone', event.target.value)} />
              </label>
              <label className="space-y-2">
                <span className="label">Email</span>
                <input className="input" type="email" value={editing.email ?? ''} onChange={(event) => updateEditing('email', event.target.value)} />
              </label>
              <label className="space-y-2">
                <span className="label">Website</span>
                <input className="input" value={editing.website ?? ''} onChange={(event) => updateEditing('website', event.target.value)} />
              </label>
              <label className="space-y-2 sm:col-span-2">
                <span className="label">Address</span>
                <textarea className="input min-h-24" value={editing.address ?? ''} onChange={(event) => updateEditing('address', event.target.value)} />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button className="btn-secondary" type="button" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary" type="submit" disabled={savingEdit}>{savingEdit ? 'Saving…' : 'Save changes'}</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
