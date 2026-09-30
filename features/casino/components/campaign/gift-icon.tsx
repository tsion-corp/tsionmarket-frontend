export function GiftIcon({ complete = false }: { complete?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {complete ? (
        <path d="m6.8 12.2 3.2 3.2 7.2-7.3" />
      ) : (
        <>
          <path d="M4 10h16v10H4zM3 7h18v4H3zM12 7v13" />
          <path d="M12 7H8.7C6.9 7 6 6.2 6 5.1 6 4 6.9 3.3 8 3.3c1.8 0 3.2 1.7 4 3.7Zm0 0h3.3C17.1 7 18 6.2 18 5.1c0-1.1-.9-1.8-2-1.8-1.8 0-3.2 1.7-4 3.7Z" />
        </>
      )}
    </svg>
  );
}
