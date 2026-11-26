interface Props {
  visible: boolean;
  onToggle: () => void;
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onApply: () => void;
  onReset: () => void;
  cells: number | null;
}

export default function HeatmapControls(props: Props) {
  return (
    <section className="panel">
      <h2>Heatmap</h2>

      <label className="switch">
        <input type="checkbox" checked={props.visible} onChange={props.onToggle} />
        Show activity heatmap
        {props.cells != null && <span className="hint"> ({props.cells} cells)</span>}
      </label>

      <div className="date-row">
        <label>
          From
          <input
            type="date"
            value={props.from}
            onChange={(e) => props.onFromChange(e.target.value)}
          />
        </label>
        <label>
          To
          <input type="date" value={props.to} onChange={(e) => props.onToChange(e.target.value)} />
        </label>
      </div>

      <div className="btn-row">
        <button onClick={props.onApply}>Apply dates</button>
        <button onClick={props.onReset}>Reset</button>
      </div>
    </section>
  );
}
