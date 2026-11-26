'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/app/lib/supabase';
import {
  Car,
  Calendar,
  Plus,
  Minus,
  LogOut,
  CheckCircle2,
  Clock,
  XCircle,
  Receipt,
  CreditCard,
  AlertTriangle,
  Shield,
  Sparkles,
  Printer,
  X,
} from 'lucide-react';

const DEFAULT_CAR_IMAGE =
  'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=900&q=80';

interface CarItem {
  id: string;
  brand_model: string;
  license_plate: string;
  car_type: string;
  daily_rate: number;
  image_url?: string | null;
  is_active: boolean;
}

interface AddonCatalog {
  name: string;
  type: 'rental' | 'purchase';
  price: number;
  unitLabel: string;
}

const ADDON_OPTIONS: AddonCatalog[] = [
  { name: 'ประกันภัยชั้น 1 (Full Protection)', type: 'rental', price: 350, unitLabel: 'บาท/วัน' },
  { name: 'เบาะนั่งนิรภัยเด็ก (Child Car Seat)', type: 'rental', price: 150, unitLabel: 'บาท/วัน' },
  { name: 'Pocket Wi-Fi / GPS Navigator', type: 'rental', price: 120, unitLabel: 'บาท/วัน' },
  { name: 'บริการรับ-ส่งรถนอกสถานที่', type: 'purchase', price: 500, unitLabel: 'บาท/ครั้ง' },
];

export default function CustomerDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [profile, setProfile] = useState<any>(null);

  // Data States
  const [cars, setCars] = useState<CarItem[]>([]);
  const [activeRentals, setActiveRentals] = useState<any[]>([]);
  const [myRentals, setMyRentals] = useState<any[]>([]);

  // Date & Form States (defer new Date() to client effect)
  const [todayStr, setTodayStr] = useState<string>('');
  const [selectedCarId, setSelectedCarId] = useState<string>('');
  const [pickupDate, setPickupDate] = useState<string>('');
  const [returnDate, setReturnDate] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'promptpay' | 'credit_card' | 'cash'>('promptpay');
  const [selectedAddons, setSelectedAddons] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; msg: string } | null>(null);

  // Receipt Modal
  const [receiptRental, setReceiptRental] = useState<any | null>(null);

  useEffect(() => {
    const clientToday = new Date().toISOString().split('T')[0];
    setTodayStr(clientToday);
    setPickupDate((prev) => prev || clientToday);
    setReturnDate((prev) => prev || clientToday);
  }, []);

  useEffect(() => {
    initData();
  }, []);

  const initData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }

    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (prof?.role === 'admin') {
      router.push('/admin');
      return;
    }
    setProfile(prof || { id: user.id, full_name: user.email });

    await fetchAllData(user.id);
    setLoading(false);
  };

  const fetchAllData = async (userId: string) => {
    const { data: carsData } = await supabase
      .from('cars')
      .select('*')
      .eq('is_active', true)
      .order('daily_rate', { ascending: true });
    if (carsData) {
      setCars(carsData);
      if (carsData.length > 0 && !selectedCarId) {
        setSelectedCarId(carsData[0].id);
      }
    }

    const { data: busyData } = await supabase
      .from('rentals')
      .select('id, car_id, pickup_date, return_date, status')
      .neq('status', 'cancelled');
    if (busyData) setActiveRentals(busyData);

    const { data: historyData } = await supabase
      .from('rentals')
      .select(`
        *,
        cars (brand_model, license_plate, car_type, daily_rate, image_url),
        rental_addons (*),
        payments (*)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (historyData) setMyRentals(historyData);
  };

  const rentalDays = useMemo(() => {
    if (!pickupDate || !returnDate) return 1;
    const start = new Date(pickupDate);
    const end = new Date(returnDate);
    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays > 0 ? diffDays : 0;
  }, [pickupDate, returnDate]);

  const isDateConflict = useMemo(() => {
    if (!selectedCarId || !pickupDate || !returnDate || rentalDays <= 0) return false;
    return activeRentals.some(
      (r) =>
        r.car_id === selectedCarId &&
        pickupDate <= r.return_date &&
        returnDate >= r.pickup_date
    );
  }, [selectedCarId, pickupDate, returnDate, rentalDays, activeRentals]);

  const selectedCar = cars.find((c) => c.id === selectedCarId);

  const pricingSummary = useMemo(() => {
    const carTotal = selectedCar ? Number(selectedCar.daily_rate) * rentalDays : 0;
    let addonsTotal = 0;

    ADDON_OPTIONS.forEach((item) => {
      const qty = selectedAddons[item.name] || 0;
      if (qty > 0) {
        const multiplier = item.type === 'rental' ? rentalDays : 1;
        addonsTotal += item.price * qty * multiplier;
      }
    });

    return {
      carTotal,
      addonsTotal,
      grandTotal: carTotal + addonsTotal,
    };
  }, [selectedCar, rentalDays, selectedAddons]);

  const updateAddonQty = (name: string, delta: number) => {
    setSelectedAddons((prev) => {
      const next = Math.max(0, (prev[name] || 0) + delta);
      return { ...prev, [name]: next };
    });
  };

  const handleCreateRental = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!profile?.id || !selectedCar) return;
    if (rentalDays <= 0) {
      setFeedback({ type: 'error', msg: 'วันคืนรถต้องไม่ก่อนวันรับรถ' });
      return;
    }
    if (isDateConflict) {
      setFeedback({ type: 'error', msg: 'รถคันนี้ถูกจองในช่วงวันที่คุณเลือกแล้ว กรุณาเลือกวันหรือรถคันอื่น' });
      return;
    }

    setSubmitting(true);
    try {
      const { data: newRental, error: rentalErr } = await supabase
        .from('rentals')
        .insert({
          user_id: profile.id,
          car_id: selectedCar.id,
          pickup_date: pickupDate,
          return_date: returnDate,
          status: 'pending',
          total_amount: pricingSummary.grandTotal,
        })
        .select()
        .single();

      if (rentalErr) {
        if (rentalErr.code === '23P01') {
          throw new Error('ขออภัย รถคันนี้เพิ่งถูกจองในช่วงเวลาดังกล่าวไปเมื่อสักครู่');
        }
        throw rentalErr;
      }

      const addonRows = ADDON_OPTIONS.filter((item) => (selectedAddons[item.name] || 0) > 0).map(
        (item) => {
          const qty = selectedAddons[item.name];
          const effectiveUnitPrice = item.type === 'rental' ? item.price * rentalDays : item.price;
          return {
            rental_id: newRental.id,
            item_name:
              item.type === 'rental' ? `${item.name} (${rentalDays} วัน)` : item.name,
            item_type: item.type,
            quantity: qty,
            unit_price: effectiveUnitPrice,
          };
        }
      );

      if (addonRows.length > 0) {
        const { error: addonErr } = await supabase.from('rental_addons').insert(addonRows);
        if (addonErr) throw addonErr;
      }

      const { error: payErr } = await supabase.from('payments').insert({
        rental_id: newRental.id,
        amount: pricingSummary.grandTotal,
        method: paymentMethod,
        status: 'unpaid',
        paid_at: null,
      });
      if (payErr) throw payErr;

      setFeedback({
        type: 'success',
        msg: 'ส่งคำขอเช่ารถสำเร็จ! กรุณารอเจ้าหน้าที่ตรวจสอบและยืนยันการชำระเงิน',
      });
      setSelectedAddons({});
      await fetchAllData(profile.id);
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message || 'ไม่สามารถทำรายการจองได้' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelRental = async (rentalId: string) => {
    if (!confirm('ยืนยันการยกเลิกรายการเช่ารถนี้?')) return;
    const { error } = await supabase
      .from('rentals')
      .update({ status: 'cancelled' })
      .eq('id', rentalId);

    if (!error && profile?.id) {
      await fetchAllData(profile.id);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        กำลังโหลดข้อมูลระบบเช่ารถ...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
              <Car className="w-6 h-6" />
            </div>
            <div>
              <span className="font-bold text-lg text-white">DriveEase</span>
              <span className="hidden sm:inline text-xs text-slate-400 ml-2">Customer Portal</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-white">{profile?.full_name}</p>
              <p className="text-xs text-slate-400">{profile?.phone || 'สมาชิกทั่วไป'}</p>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
            >
              <LogOut className="w-4 h-4" />
              ออกจากระบบ
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Booking Form */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-5">
              <Sparkles className="w-5 h-5 text-blue-400" />
              จองเช่ารถยนต์ใหม่
            </h2>

            {feedback && (
              <div
                className={`p-4 rounded-xl mb-5 text-sm flex items-start gap-2.5 border ${
                  feedback.type === 'error'
                    ? 'bg-red-500/10 border-red-500/30 text-red-400'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                }`}
              >
                {feedback.type === 'error' ? (
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                )}
                <span>{feedback.msg}</span>
              </div>
            )}

            <form onSubmit={handleCreateRental} className="space-y-6">
              {/* 1. เลือกวันที่รับ-คืนรถ */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    วันที่รับรถ (Pickup Date)
                  </label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type="date"
                      min={todayStr || undefined}
                      value={pickupDate}
                      onChange={(e) => {
                        setPickupDate(e.target.value);
                        if (e.target.value > returnDate) setReturnDate(e.target.value);
                      }}
                      className="w-full pl-10 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    วันที่คืนรถ (Return Date)
                  </label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type="date"
                      min={pickupDate || todayStr || undefined}
                      value={returnDate}
                      onChange={(e) => setReturnDate(e.target.value)}
                      className="w-full pl-10 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* 2. เลือกรุ่นรถยนต์พร้อมรูปภาพ */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-slate-400">เลือกรถยนต์ที่ต้องการ</label>
                  <span className="text-xs text-blue-400 font-medium">
                    ระยะเวลาเช่า: {rentalDays} วัน
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {cars.map((car) => {
                    const isBusy = activeRentals.some(
                      (r) =>
                        r.car_id === car.id &&
                        pickupDate <= r.return_date &&
                        returnDate >= r.pickup_date
                    );
                    const isSelected = selectedCarId === car.id;

                    return (
                      <button
                        type="button"
                        key={car.id}
                        onClick={() => setSelectedCarId(car.id)}
                        className={`rounded-2xl border text-left overflow-hidden transition-all relative ${
                          isSelected
                            ? 'bg-blue-600/15 border-blue-500 ring-1 ring-blue-500'
                            : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <img
                          src={car.image_url || DEFAULT_CAR_IMAGE}
                          alt={car.brand_model}
                          className="w-full h-36 object-cover border-b border-slate-800"
                        />
                        <div className="p-3.5">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                              {car.car_type}
                            </span>
                            {isBusy ? (
                              <span className="text-[11px] font-medium text-red-400 bg-red-500/10 px-2 py-0.5 rounded">
                                ไม่ว่างช่วงนี้
                              </span>
                            ) : (
                              <span className="text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                                พร้อมให้บริการ
                              </span>
                            )}
                          </div>
                          <p className="font-semibold text-sm text-white mt-1.5">{car.brand_model}</p>
                          <p className="text-xs text-slate-500">{car.license_plate}</p>
                          <p className="text-sm font-bold text-blue-400 mt-2">
                            ฿{Number(car.daily_rate).toLocaleString()}{' '}
                            <span className="text-xs font-normal text-slate-400">/ วัน</span>
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {isDateConflict && (
                  <p className="text-xs text-red-400 mt-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    รถคันนี้มีคิวจองซ้อนในช่วงวันที่คุณเลือก กรุณาเปลี่ยนวันที่หรือเลือกรถคันอื่น
                  </p>
                )}
              </div>

              {/* 3. อุปกรณ์เสริมและประกัน (Add-ons) */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">
                  บริการเสริมและอุปกรณ์เพิ่มเติม (Add-ons)
                </label>
                <div className="space-y-2.5">
                  {ADDON_OPTIONS.map((addon) => {
                    const qty = selectedAddons[addon.name] || 0;
                    return (
                      <div
                        key={addon.name}
                        className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800"
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-200">{addon.name}</p>
                          <p className="text-xs text-slate-400">
                            ฿{addon.price.toLocaleString()} {addon.unitLabel}
                          </p>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => updateAddonQty(addon.name, -1)}
                            className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-5 text-center text-sm font-semibold">{qty}</span>
                          <button
                            type="button"
                            onClick={() => updateAddonQty(addon.name, 1)}
                            className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 4. วิธีชำระเงิน */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">
                  ช่องทางการชำระเงิน
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { id: 'promptpay', label: 'PromptPay QR' },
                    { id: 'credit_card', label: 'บัตรเครดิต' },
                    { id: 'cash', label: 'เงินสดหน้างาน' },
                  ].map((m) => (
                    <button
                      type="button"
                      key={m.id}
                      onClick={() => setPaymentMethod(m.id as any)}
                      className={`py-2.5 px-3 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                        paymentMethod === m.id
                          ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 5. สรุปยอดเงิน */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                {selectedCar && (
                  <div className="flex items-center gap-3 pb-2.5 border-b border-slate-800/80">
                    <img
                      src={selectedCar.image_url || DEFAULT_CAR_IMAGE}
                      alt={selectedCar.brand_model}
                      className="w-16 h-11 object-cover rounded-lg border border-slate-800 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">
                        {selectedCar.brand_model}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        ทะเบียน {selectedCar.license_plate} • {selectedCar.car_type}
                      </p>
                    </div>
                  </div>
                )}
                <div className="flex justify-between text-xs text-slate-400">
                  <span>
                    ค่าเช่ารถ ({selectedCar?.brand_model || '-'} x {rentalDays} วัน)
                  </span>
                  <span>฿{pricingSummary.carTotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>บริการเสริมและประกัน</span>
                  <span>฿{pricingSummary.addonsTotal.toLocaleString()}</span>
                </div>
                <div className="border-t border-slate-800 pt-2 flex justify-between items-center">
                  <span className="text-sm font-semibold text-white">ยอดรวมสุทธิ</span>
                  <span className="text-xl font-bold text-blue-400">
                    ฿{pricingSummary.grandTotal.toLocaleString()}
                  </span>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || isDateConflict || rentalDays <= 0 || !selectedCar}
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold text-sm transition-all shadow-lg shadow-blue-600/20"
              >
                {submitting ? 'กำลังบันทึกการจอง...' : 'ยืนยันการจองเช่ารถ'}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: User Rental History */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <h2 className="text-lg font-bold text-white mb-4">ประวัติการเช่ารถของคุณ</h2>

            {myRentals.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm">
                ยังไม่มีประวัติการเช่ารถยนต์
              </div>
            ) : (
              <div className="space-y-4">
                {myRentals.map((rental) => {
                  const payment = rental.payments?.[0];
                  const isPaid = payment?.status === 'paid';

                  return (
                    <div
                      key={rental.id}
                      className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={rental.cars?.image_url || DEFAULT_CAR_IMAGE}
                            alt={rental.cars?.brand_model || 'Car'}
                            className="w-16 h-12 object-cover rounded-lg border border-slate-800 shrink-0"
                          />
                          <div>
                            <p className="font-semibold text-white text-sm">
                              {rental.cars?.brand_model}
                            </p>
                            <p className="text-xs text-slate-400">
                              ทะเบียน: {rental.cars?.license_plate}
                            </p>
                          </div>
                        </div>

                        <span
                          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1 shrink-0 ${
                            rental.status === 'confirmed'
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : rental.status === 'completed'
                              ? 'bg-blue-500/15 text-blue-400'
                              : rental.status === 'cancelled'
                              ? 'bg-red-500/15 text-red-400'
                              : 'bg-amber-500/15 text-amber-400'
                          }`}
                        >
                          {rental.status === 'confirmed' && <CheckCircle2 className="w-3 h-3" />}
                          {rental.status === 'pending' && <Clock className="w-3 h-3" />}
                          {rental.status === 'cancelled' && <XCircle className="w-3 h-3" />}
                          {rental.status.toUpperCase()}
                        </span>
                      </div>

                      <div className="text-xs text-slate-300 bg-slate-900 p-2.5 rounded-lg flex justify-between">
                        <span>รับรถ: {rental.pickup_date}</span>
                        <span>คืนรถ: {rental.return_date}</span>
                      </div>

                      {rental.rental_addons?.length > 0 && (
                        <div className="text-xs text-slate-400 space-y-1">
                          {rental.rental_addons.map((ad: any) => (
                            <div key={ad.id} className="flex justify-between">
                              <span>
                                • {ad.item_name} x{ad.quantity}
                              </span>
                              <span>฿{Number(ad.subtotal).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                        <div>
                          <span className="text-xs text-slate-400 block">ยอดชำระรวม</span>
                          <span className="text-base font-bold text-white">
                            ฿{Number(rental.total_amount).toLocaleString()}
                          </span>
                          <span
                            className={`ml-2 text-[11px] font-medium ${
                              isPaid
                                ? 'text-emerald-400'
                                : payment?.status === 'refunded'
                                ? 'text-purple-400'
                                : 'text-amber-400'
                            }`}
                          >
                            ({payment?.status || 'unpaid'})
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {isPaid && (
                            <button
                              onClick={() => setReceiptRental(rental)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
                            >
                              <Receipt className="w-3.5 h-3.5" />
                              ดูใบเสร็จ
                            </button>
                          )}

                          {rental.status === 'pending' && (
                            <button
                              onClick={() => handleCancelRental(rental.id)}
                              className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium transition-colors"
                            >
                              ยกเลิก
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Electronic Receipt Modal */}
      {receiptRental && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white text-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Shield className="w-6 h-6 text-blue-600" />
                <div>
                  <h3 className="font-bold text-base text-slate-900">ใบเสร็จรับเงินอิเล็กทรอนิกส์</h3>
                  <p className="text-xs text-slate-500">DriveEase Car Rental Co., Ltd.</p>
                </div>
              </div>
              <button
                onClick={() => setReceiptRental(null)}
                className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-sm">
              <div className="flex justify-between text-xs text-slate-500">
                <span>เลขที่ใบเสร็จ: #{receiptRental.id.slice(0, 8).toUpperCase()}</span>
                <span>
                  วันที่ชำระ:{' '}
                  {receiptRental.payments?.[0]?.paid_at
                    ? new Date(receiptRental.payments[0].paid_at).toLocaleString('th-TH')
                    : '-'}
                </span>
              </div>

              <div className="p-3 bg-slate-100 rounded-xl flex items-center gap-3 text-xs">
                <img
                  src={receiptRental.cars?.image_url || DEFAULT_CAR_IMAGE}
                  alt={receiptRental.cars?.brand_model || 'Car'}
                  className="w-20 h-14 object-cover rounded-lg border border-slate-300 shrink-0"
                />
                <div className="space-y-1">
                  <p>
                    <span className="text-slate-500">ผู้เช่า:</span>{' '}
                    <strong className="text-slate-800">{profile?.full_name}</strong>
                  </p>
                  <p>
                    <span className="text-slate-500">รถยนต์:</span>{' '}
                    <strong className="text-slate-800">
                      {receiptRental.cars?.brand_model} ({receiptRental.cars?.license_plate})
                    </strong>
                  </p>
                  <p>
                    <span className="text-slate-500">ช่วงเวลาเช่า:</span>{' '}
                    <strong className="text-slate-800">
                      {receiptRental.pickup_date} ถึง {receiptRental.return_date}
                    </strong>
                  </p>
                  <p>
                    <span className="text-slate-500">ช่องทางชำระเงิน:</span>{' '}
                    <strong className="uppercase text-slate-800">
                      {receiptRental.payments?.[0]?.method}
                    </strong>
                  </p>
                </div>
              </div>

              <div className="border-t border-b border-dashed border-slate-300 py-3 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span>ค่าเช่ารถยนต์ตามระยะเวลา</span>
                  <span className="font-medium">
                    ฿
                    {(
                      Number(receiptRental.total_amount) -
                      (receiptRental.rental_addons?.reduce(
                        (acc: number, item: any) => acc + Number(item.subtotal),
                        0
                      ) || 0)
                    ).toLocaleString()}
                  </span>
                </div>
                {receiptRental.rental_addons?.map((ad: any) => (
                  <div key={ad.id} className="flex justify-between text-slate-600">
                    <span>
                      {ad.item_name} (x{ad.quantity})
                    </span>
                    <span>฿{Number(ad.subtotal).toLocaleString()}</span>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center pt-1">
                <span className="font-bold text-slate-900">ยอดชำระสุทธิ (PAID)</span>
                <span className="text-xl font-extrabold text-emerald-600">
                  ฿{Number(receiptRental.total_amount).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex gap-2">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                พิมพ์ใบเสร็จ
              </button>
              <button
                onClick={() => setReceiptRental(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
