import React, { useState } from 'react';

const WHATSAPP_URL = 'https://wa.me/254739776294?text=Hello%20TypeMyworDz%2C%20I%20need%20help%20with%20the%20app.';

const FloatingWhatsApp = () => {
  const [hovered, setHovered] = useState(false);
  const label = hovered ? 'Chat with us' : 'Chat';

  return (
    <a
      className="tm-floating-whatsapp"
      href={WHATSAPP_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="Chat with TypeMyworDz on WhatsApp"
      title="Chat with us on WhatsApp"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      style={{
        position: 'fixed',
        right: '20px',
        bottom: '20px',
        zIndex: 1500,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '7px',
        minHeight: '48px',
        padding: '8px 14px 8px 10px',
        borderRadius: '999px',
        background: '#25D366',
        color: '#fff',
        textDecoration: 'none',
        boxShadow: '0 8px 22px rgba(19, 74, 37, 0.22)',
        transition: 'transform 180ms ease, box-shadow 180ms ease',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        whiteSpace: 'nowrap',
        font: '600 13px var(--tm-font, Arial, sans-serif)',
      }}
    >
      <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <circle cx="16" cy="16" r="15" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path fill="currentColor" d="M23.3 8.65A10.3 10.3 0 0 0 16 5.62c-5.7 0-10.33 4.63-10.33 10.33 0 1.82.48 3.6 1.39 5.16L5.6 26.38l5.39-1.41a10.3 10.3 0 0 0 5.01 1.28h.01c5.7 0 10.33-4.63 10.33-10.33 0-2.76-1.08-5.35-3.04-7.27Zm-7.3 15.82h-.01a8.57 8.57 0 0 1-4.36-1.19l-.31-.18-3.2.84.85-3.12-.2-.32a8.59 8.59 0 1 1 7.23 3.97Zm4.7-6.43c-.26-.13-1.54-.76-1.78-.85-.24-.09-.41-.13-.59.13-.17.26-.67.85-.82 1.02-.15.17-.3.2-.56.07-.26-.13-1.07-.39-2.04-1.25-.75-.67-1.25-1.5-1.4-1.76-.15-.26-.02-.4.11-.53.12-.12.26-.3.39-.45.13-.15.17-.26.26-.43.09-.17.04-.32-.02-.45-.07-.13-.59-1.42-.81-1.95-.21-.51-.43-.44-.59-.45h-.5c-.17 0-.45.06-.69.32-.24.26-.91.89-.91 2.17s.93 2.52 1.06 2.69c.13.17 1.83 2.79 4.44 3.91.62.27 1.1.43 1.48.55.62.2 1.19.17 1.64.1.5-.08 1.54-.63 1.76-1.24.22-.61.22-1.13.15-1.24-.06-.11-.24-.17-.5-.3Z" />
      </svg>
      <span>{label}</span>
    </a>
  );
};

export default FloatingWhatsApp;
