import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api/client";

interface EwayBill {
  id: string; voucher_id: string; voucher_number: string | null;
  gstin: string | null; eway_bill_number: string | null; eway_bill_date: string | null;
  valid_until: string | null; vehicle_number: string | null;
  transport_mode: string | null; distance_km: number;
  taxable_amount: number; cgst_amount: number; sgst_amount: number; igst_amount: number;
  status: string; total_value: number; error_message: string | null; created_at: string | null;
}

interface Voucher { id: string; voucher_number: string; voucher_type: string; }
interface GstRegistration { id: string; gstin: string; legal_name: string; is_primary: boolean; }

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300",
  submitted: "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
  generated: "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
  cancelled: "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400",
  failed: "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
};

const CANCEL_REASONS = [
  { code: "1", label: "Duplicate" },
  { code: "2", label: "Data Entry Mistake" },
  { code: "3", label: "Order Cancelled" },
  { code: "4", label: "Other" },
];

export default function EwayBillPage() {
  const [bills, setBills] = useState<EwayBill[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [registrations, setRegistrations] = useState<GstRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<EwayBill | null>(null);

  // create form
  const [selectedVoucher, setSelectedVoucher] = useState("");
  const [selectedGstin, setSelectedGstin] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [transportMode, setTransportMode] = useState("Road");
  const [distanceKm, setDistanceKm] = useState("");

  // cancel form
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("4");
  const [cancelRemark, setCancelRemark] = useState("");

  // vehicle update form
  const [showVehicleUpdate, setShowVehicleUpdate] = useState(false);
  const [updateVehicle, setUpdateVehicle] = useState("");

  const refresh = () => {
    setLoading(true);
    Promise.all([
      api.get<EwayBill[]>("/eway-bill"),
      api.get<Voucher[]>("/vouchers").catch(() => []),
      api.get<GstRegistration[]>("/gst/registrations"),
    ]).then(([eb, v, reg]) => {
      setVouchers(v);
      setRegistrations(reg);
      setBills(eb);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api.post("/eway-bill/create", {
        voucher_id: selectedVoucher,
        gstin_id: selectedGstin,
        vehicle_number: vehicleNumber || null,
        transport_mode: transportMode,
        distance_km: parseInt(distanceKm) || 0,
      });
      setShowCreate(false);
      setSelectedVoucher("");
      setSelectedGstin("");
      setVehicleNumber("");
      setDistanceKm("");
      refresh();
    } catch (err: any) {
      setError(err?.detail || "Failed to create E-Way Bill");
    }
  };

  const handleGenerate = async (eb: EwayBill) => {
    if (!confirm(`Generate E-Way Bill? This will submit to GSTN.`)) return;
    setError("");
    try {
      const result = await api.post<EwayBill>(`/eway-bill/${eb.id}/generate`);
      setDetail(result);
      refresh();
    } catch (err: any) {
      setError(err?.detail || "Failed to generate E-Way Bill");
    }
  };

  const handleCancel = async (e: FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    setError("");
    try {
      const result = await api.post<EwayBill>(`/eway-bill/${detail.id}/cancel`, {
        cancel_reason: cancelReason,
        cancel_remark: cancelRemark,
      });
      setDetail(result);
      setShowCancel(false);
      setCancelRemark("");
      refresh();
    } catch (err: any) {
      setError(err?.detail || "Failed to cancel E-Way Bill");
    }
  };

  const handleVehicleUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    setError("");
    try {
      const result = await api.post<EwayBill>(`/eway-bill/${detail.id}/vehicle`, {
        vehicle_number: updateVehicle,
        transport_mode: transportMode,
      });
      setDetail(result);
      setShowVehicleUpdate(false);
      setUpdateVehicle("");
      refresh();
    } catch (err: any) {
      setError(err?.detail || "Failed to update vehicle");
    }
  };

  const viewDetail = async (eb: EwayBill) => {
    try {
      const full = await api.get<EwayBill>(`/eway-bill/${eb.id}`);
      setDetail(full);
    } catch {
      setDetail(eb);
    }
  };

  if (detail) {
    return (
      <div>
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
          <div>
            <button onClick={() => { setDetail(null); setShowCancel(false); setShowVehicleUpdate(false); }} className="text-sm text-brand-600 dark:text-brand-400 hover:underline">← Back to E-Way Bills</button>
            <h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">E-Way Bill Detail</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[detail.status] || "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400"}`}>
              {detail.status}
            </span>
            {detail.status === "draft" && (
              <button onClick={() => handleGenerate(detail)}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
                Generate E-Way Bill
              </button>
            )}
            {detail.status === "generated" && (
              <>
                <button onClick={() => setShowVehicleUpdate(!showVehicleUpdate)}
                  className="rounded-lg border border-blue-300 dark:border-blue-700 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30">
                  Update Vehicle
                </button>
                <button onClick={() => setShowCancel(!showCancel)}
                  className="rounded-lg border border-red-300 dark:border-red-700 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30">
                  Cancel E-Way Bill
                </button>
              </>
            )}
          </div>
        </div>

        {showCancel && (
          <form onSubmit={handleCancel} className="mt-4 rounded-lg border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/30 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-red-800 dark:text-red-300">Cancel E-Way Bill</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Reason</label>
                <select value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm">
                  {CANCEL_REASONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Remark</label>
                <input type="text" value={cancelRemark} onChange={(e) => setCancelRemark(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm"
                  placeholder="Cancellation remark..." required />
              </div>
            </div>
            <button type="submit"
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
              Confirm Cancel
            </button>
          </form>
        )}

        {showVehicleUpdate && (
          <form onSubmit={handleVehicleUpdate} className="mt-4 rounded-lg border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-300">Update Vehicle Details</h3>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Vehicle Number</label>
              <input type="text" value={updateVehicle} onChange={(e) => setUpdateVehicle(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm"
                placeholder="e.g. MH01AB1234" required />
            </div>
            <button type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Update Vehicle
            </button>
          </form>
        )}

        <div className="mt-4 space-y-4">
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">E-Way Bill Details</h3>
            <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-slate-500 dark:text-slate-400">E-Way Bill No</span>
                <p className="font-mono font-medium">{detail.eway_bill_number || "—"}</p>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Date</span>
                <p className="font-medium">{detail.eway_bill_date || "—"}</p>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Valid Until</span>
                <p className="font-medium">{detail.valid_until || "—"}</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Transport Details</h3>
            <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-slate-500 dark:text-slate-400">Vehicle No</span>
                <p className="font-medium">{detail.vehicle_number || "—"}</p>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Transport Mode</span>
                <p className="font-medium">{detail.transport_mode || "—"}</p>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Distance (km)</span>
                <p className="font-medium">{detail.distance_km || "—"}</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Value Details</h3>
            <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-slate-500 dark:text-slate-400">Taxable Amount</span>
                <p className="font-medium">₹{detail.taxable_amount.toLocaleString("en-IN")}</p>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Total GST</span>
                <p className="font-medium">₹{(detail.cgst_amount + detail.sgst_amount + detail.igst_amount).toLocaleString("en-IN")}</p>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Total Value</span>
                <p className="font-medium text-emerald-700 dark:text-emerald-400">₹{detail.total_value.toLocaleString("en-IN")}</p>
              </div>
            </div>
          </div>

          {detail.status === "failed" && detail.error_message && (
            <div className="rounded-lg border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/30 p-4">
              <h3 className="text-sm font-semibold text-red-800 dark:text-red-300">Error</h3>
              <p className="mt-1 text-sm text-red-700 dark:text-red-400">{detail.error_message}</p>
            </div>
          )}

          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 text-sm text-slate-500 dark:text-slate-400">
            <p>Voucher ID: <span className="font-mono text-xs">{detail.voucher_id}</span></p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">E-Way Bill (GSTN)</h2>
        <button onClick={() => setShowCreate(!showCreate)}
          className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
          {showCreate ? "Cancel" : "+ Create E-Way Bill"}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="mt-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Voucher</label>
              <select value={selectedVoucher} onChange={(e) => setSelectedVoucher(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm" required>
                <option value="">Select voucher...</option>
                {vouchers.filter((v) => v.voucher_type === "sales").map((v) => (
                  <option key={v.id} value={v.id}>#{v.voucher_number}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Seller GSTIN</label>
              <select value={selectedGstin} onChange={(e) => setSelectedGstin(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm" required>
                <option value="">Select GSTIN...</option>
                {registrations.map((r) => (
                  <option key={r.id} value={r.id}>{r.gstin} — {r.legal_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Vehicle Number</label>
              <input type="text" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm"
                placeholder="e.g. MH01AB1234" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Transport Mode</label>
              <select value={transportMode} onChange={(e) => setTransportMode(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm">
                <option value="Road">Road</option>
                <option value="Rail">Rail</option>
                <option value="Air">Air</option>
                <option value="Ship">Ship</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Distance (km)</label>
              <input type="number" value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm"
                placeholder="0" />
            </div>
          </div>
          {error && <p className="rounded-lg bg-red-50 dark:bg-red-900/30 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
          <button type="submit"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Create E-Way Bill
          </button>
        </form>
      )}

      {error && !showCreate && (
        <div className="mt-4 rounded-lg bg-red-50 dark:bg-red-900/30 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</div>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Loading…</p>
      ) : (
        <div className="mt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-xs font-medium uppercase text-slate-500 dark:text-slate-400">
                <th className="pb-2">Voucher</th>
                <th className="pb-2">EWB No</th>
                <th className="pb-2">Vehicle No</th>
                <th className="pb-2">Total Value</th>
                <th className="pb-2">Valid Until</th>
                <th className="pb-2">Status</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {bills.map((eb) => (
                <tr key={eb.id} className="border-b border-slate-100 dark:border-slate-700/50 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  onClick={() => viewDetail(eb)}>
                  <td className="py-2 font-medium">{eb.voucher_number || eb.voucher_id.slice(0, 8)}</td>
                  <td className="py-2 font-mono text-xs">{eb.eway_bill_number || "—"}</td>
                  <td className="py-2 font-medium">{eb.vehicle_number || "—"}</td>
                  <td className="py-2 text-right tabular-nums">₹{eb.total_value.toLocaleString("en-IN")}</td>
                  <td className="py-2 text-slate-600 dark:text-slate-400">{eb.valid_until || "—"}</td>
                  <td className="py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[eb.status] || "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400"}`}>
                      {eb.status}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    {eb.status === "draft" && (
                      <button onClick={(e) => { e.stopPropagation(); handleGenerate(eb); }}
                        className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline">Generate</button>
                    )}
                  </td>
                </tr>
              ))}
              {bills.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-slate-400 dark:text-slate-500">No E-Way Bills yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
