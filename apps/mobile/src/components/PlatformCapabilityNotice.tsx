import { Platform } from 'react-native';
import { Body, Caption } from './Typography';
import { Panel } from './Panel';

/** Makes the web companion's reduced notification capability explicit. */
export function PlatformCapabilityNotice() {
  if (Platform.OS !== 'web') return null;
  return (
    <Panel tone="urgent">
      <Caption>VERSIÓN WEB</Caption>
      <Body>Esta versión permite registrar, revisar y exportar datos. No reemplaza los recordatorios nativos ni garantiza alertas cuando la pestaña está cerrada. Usa Android o iOS para alarmas locales.</Body>
    </Panel>
  );
}
