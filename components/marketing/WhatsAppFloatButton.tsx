export function WhatsAppFloatButton() {
  const number = process.env.NEXT_PUBLIC_CONTACT_WHATSAPP;
  if (!number) return null;

  const message = encodeURIComponent(
    "Hola, quiero saber más sobre Cohortech para mi clínica"
  );

  return (
    <a
      href={`https://wa.me/${number}?text=${message}`}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-2xl shadow-lg transition-transform hover:scale-105"
      aria-label="Escríbenos por WhatsApp"
    >
      💬
    </a>
  );
}
