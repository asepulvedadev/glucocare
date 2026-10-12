import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';
import { cancelMedicationReminder } from './notifications';

export type ExportFormat = 'json' | 'csv';

type TableRows = Record<string, unknown>[];

async function rows(db: SQLiteDatabase, table: string): Promise<TableRows> {
  return db.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${table}`);
}

export async function buildExportContent(db: SQLiteDatabase, format: ExportFormat) {
  const exportedAt = new Date().toISOString();
  const bundle = {
    schemaVersion: 1,
    exportedAt,
    glucoseReadings: await rows(db, 'glucose_readings'),
    medications: await rows(db, 'medications'),
    appointments: await rows(db, 'appointments'),
    emergencyCard: await rows(db, 'emergency_card'),
    trustedContacts: await rows(db, 'trusted_contacts'),
    helpEvents: await rows(db, 'help_events'),
  };
  if (format === 'json') return { content: JSON.stringify(bundle, null, 2), filename: `glucocare-export-${Date.now()}.json`, mimeType: 'application/json' };

  const glucose = bundle.glucoseReadings;
  const header = ['recorded_at', 'value', 'unit', 'context', 'symptoms', 'note'];
  const csvValue = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const body = glucose.map((reading) => header.map((field) => csvValue(reading[field])).join(',')).join('\n');
  return { content: `${header.join(',')}\n${body}\n`, filename: `glucocare-glucose-${Date.now()}.csv`, mimeType: 'text/csv' };
}

export async function shareExport(db: SQLiteDatabase, format: ExportFormat): Promise<{ shared: boolean; filename: string }> {
  const exported = await buildExportContent(db, format);
  if (Platform.OS === 'web') {
    if (typeof document === 'undefined') return { shared: false, filename: exported.filename };
    const blob = new Blob([exported.content], { type: exported.mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = exported.filename; anchor.click(); URL.revokeObjectURL(url);
    return { shared: true, filename: exported.filename };
  }
  const file = new File(Paths.cache, exported.filename);
  file.write(exported.content);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: exported.mimeType, dialogTitle: 'Exportar datos de GlucoCare' });
    return { shared: true, filename: exported.filename };
  }
  return { shared: false, filename: file.uri };
}

export async function deleteAllLocalData(db: SQLiteDatabase) {
  const scheduled = await db.getAllAsync<{ notification_id: string | null }>('SELECT notification_id FROM medications WHERE notification_id IS NOT NULL UNION ALL SELECT notification_id FROM appointments WHERE notification_id IS NOT NULL');
  for (const row of scheduled) await cancelMedicationReminder(row.notification_id ?? undefined);
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM glucose_readings');
    await db.runAsync('DELETE FROM medications');
    await db.runAsync('DELETE FROM appointments');
    await db.runAsync('DELETE FROM emergency_card');
    await db.runAsync('DELETE FROM trusted_contacts');
    await db.runAsync('DELETE FROM help_events');
  });
}
