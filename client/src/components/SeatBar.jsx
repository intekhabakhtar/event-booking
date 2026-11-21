// Visual bar showing how full an event is.
export default function SeatBar({ taken, capacity }) {
  const percent = Math.min(100, Math.round((taken / capacity) * 100));
  const full = taken >= capacity;
  const left = capacity - taken;
  const tone = full ? 'full' : percent >= 80 ? 'warn' : '';
  return (
    <div>
      <div className="bar"><div className={'fill ' + tone} style={{ width: percent + '%' }} /></div>
      <div className="bar-text">
        <span>{taken}/{capacity} booked</span>
        <span className={'badge ' + (full ? 'red' : percent >= 80 ? 'amber' : 'green')}>
          {full ? 'Sold out' : left + (left === 1 ? ' seat left' : ' seats left')}
        </span>
      </div>
    </div>
  );
}
