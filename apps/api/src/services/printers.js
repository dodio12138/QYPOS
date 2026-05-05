export const defaultPrinterProfiles = [
  { id: "kitchen", name: "厨房打印机", role: "kitchen", connection_type: "network", charset: "GBK", host: process.env.PRINTER_DEFAULT_HOST ?? "192.168.1.100", port: Number(process.env.PRINTER_DEFAULT_PORT ?? 9100), enabled: true },
  { id: "cashier", name: "收银打印机", role: "receipt", connection_type: "network", charset: "GBK", host: process.env.PRINTER_DEFAULT_HOST ?? "192.168.1.100", port: Number(process.env.PRINTER_DEFAULT_PORT ?? 9100), enabled: true },
  { id: "bar", name: "吧台打印机", role: "bar", connection_type: "network", charset: "GBK", host: "192.168.1.102", port: 9100, enabled: false }
];

export function printerProfiles(settings) {
  const value = settings?.printer_profiles;
  if (Array.isArray(value) && value.length) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch {
      // fall through to defaults
    }
  }
  return defaultPrinterProfiles;
}

export function isValidPrinter(profile) {
  if (!profile || profile.enabled === false) return false;
  if (profile.connection_type === "usb") return Boolean(profile.device_path);
  return Boolean(profile.host) && Boolean(Number(profile.port));
}

export function selectPrinter(settings, type) {
  const profiles = printerProfiles(settings);
  const preferredId = type === "kitchen" ? settings?.kitchen_printer_id : settings?.receipt_printer_id;
  const selected = profiles.find((profile) => profile.id === preferredId);
  if (!isValidPrinter(selected)) return null;
  return selected;
}
