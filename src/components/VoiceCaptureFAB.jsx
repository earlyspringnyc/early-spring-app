import { useState, useEffect } from 'react';
import T from '../theme/tokens.js';
import VoiceCaptureModal from './VoiceCaptureModal.jsx';

// Floating mic button. Mobile-only — desktop already has the dashboard
// tile, and a fixed FAB would crowd the project view sidebars. We pick
// "mobile" by viewport width with a media-query subscription so a
// resize / device-rotate switches it on/off live.

const MOBILE_BREAKPOINT = 768;

export default function VoiceCaptureFAB({ user, projects, accessToken, onFiled }) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false
  );
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!user || !isMobile) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Record a voice note"
        style={{
          position: 'fixed',
          // Sit ABOVE the Client Chats pill (right:20, bottom:20, ~42px tall)
          // so the two bottom-right elements stack instead of overlapping
          // into a single visual mass. Safe-area inset still clears the
          // iOS Safari home indicator.
          bottom: 'calc(78px + env(safe-area-inset-bottom, 0px))',
          right: 20,
          zIndex: 9996,
          width: 58, height: 58, borderRadius: 29, border: 'none',
          background: T.ink, color: T.paper,
          boxShadow: '0 6px 20px rgba(15,82,186,.32)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          fontFamily: T.sans,
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="8" y1="23" x2="16" y2="23"/>
        </svg>
      </button>

      {open && (
        <VoiceCaptureModal
          user={user}
          projects={projects}
          accessToken={accessToken}
          onClose={() => setOpen(false)}
          onFiled={onFiled}
        />
      )}
    </>
  );
}
