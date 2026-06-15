import Link from "next/link";

export default function SettingsPage() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold">Settings</h1>
      <ul className="list-inside list-disc text-sm">
        <li>
          <Link href="/settings/whatsapp" className="text-blue-600 hover:underline">
            Conexión WhatsApp
          </Link>
        </li>
      </ul>
    </div>
  );
}
