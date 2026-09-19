/**
 * An MLB headshot, straight from their public CDN.
 *
 * No error handling on purpose: a missing id returns 200 with MLB's own grey
 * silhouette rather than a 404, so there is no broken-image state to catch and
 * no reason for this to be a client component.
 *
 * width and height are set in the markup, not only in CSS, so the box is
 * reserved before the image arrives and nothing on the page moves when it
 * does.
 *
 * alt is empty by design. Every headshot sits beside the player's name in
 * text; giving it an alt would make a screen reader read the name twice.
 */
export default function Headshot({
  id,
  size = 48,
  className = "",
}: {
  id: number;
  size?: number;
  className?: string;
}) {
  return (
    <img
      className={`headshot ${className}`}
      src={`https://midfield.mlbstatic.com/v1/people/${id}/spots/${size >= 90 ? 240 : 120}`}
      width={size}
      height={size}
      alt=""
      loading="lazy"
      decoding="async"
    />
  );
}
