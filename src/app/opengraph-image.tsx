import { ImageResponse } from 'next/og';

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

const BACKGROUND = 'linear-gradient(135deg, rgb(11 14 20) 0%, rgb(20 24 32) 100%)';
const ACCENT = 'rgb(110 231 183)';
const TEXT_PRIMARY = 'rgb(230 230 230)';
const TEXT_SECONDARY = 'rgb(185 185 185)';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px 96px',
          background: BACKGROUND,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
            maxWidth: 780,
          }}
        >
          <span
            style={{
              fontSize: 32,
              color: ACCENT,
              letterSpacing: 6,
              textTransform: 'uppercase',
            }}
          >
            The Pace Tracer
          </span>
          <h1
            style={{
              margin: 0,
              fontSize: 80,
              color: TEXT_PRIMARY,
              fontWeight: 700,
              letterSpacing: -2,
            }}
          >
            Telemetry insights that keep your team fast
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: 36,
              color: TEXT_SECONDARY,
            }}
          >
            Next.js • Prisma • Layered architecture
          </p>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
