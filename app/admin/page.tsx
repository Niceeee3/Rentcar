'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/app/lib/supabase';
import {
  ShieldCheck,
  Car,
  Users,
  DollarSign,
  CheckCircle,
  XCircle,
  LogOut,
  Plus,
  RefreshCw,
  CalendarCheck,
  Edit3,
  Image as ImageIcon,
} from 'lucide-react';

const DEFAULT_CAR_IMAGE =
  'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=900&q=80';

export default function AdminDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'rentals' | 'cars' | 'users'>('rentals');

  // States
  const [profiles, setProfiles] = useState<any[]>([]);
  const [cars, setCars] = useState<any[]>([]);
  const [rentals, setRentals] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);

  // New Car Form
  const [brandModel, setBrandModel] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [carType, setCarType] = useState('Sedan');
  const [dailyRate, setDailyRate] = useState('1200');
  const [imageUrl, setImageUrl] = useState('');

  useEffect(() => {
    verifyAdminAndLoad();
  }, []);

  const verifyAdminAndLoad = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }

    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (prof?.role !== 'admin') {
      router.push('/');
      return;
    }

    await fetchAllTables();
    setLoading(false);
  };

  const fetchAllTables = async () => {
    const [resProfiles, resCars, resRentals, resPayments] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('cars').select('*').order('created_at', { ascending: false }),
      supabase
        .from('rentals')
        .select('*, profiles(full_name, phone), cars(brand_model, license_plate, image_url), payments(*), rental_addons(*)')
        .order('created_at', { ascending: false }),
      supabase.from('payments').select('*').order('created_at', { ascending: false }),
    ]);

    if (resProfiles.data) setProfiles(resProfiles.data);
    if (resCars.data) setCars(resCars.data);
    if (resRentals.data) setRentals(resRentals.data);
    if (resPayments.data) setPayments(resPayments.data);
  };

  // อนุมัติการชำระเงิน -> payments.status = 'paid', paid_at = now(), rentals.status = 'confirmed'
  const handleConfirmPayment = async (rentalId: string, paymentId?: string) => {
    const nowIso = new Date().toISOString();

    if (paymentId) {
      await supabase
        .from('payments')
        .update({ status: 'paid', paid_at: nowIso })
        .eq('id', paymentId);
    }
    await supabase.from('rentals').update({ status: 'confirmed' }).eq('id', rentalId);
    await fetchAllTables();
  };

  // ปิดงานเช่า (คืนรถเรียบร้อย)
  const handleCompleteRental = async (rentalId: string) => {
    await supabase.from('rentals').update({ status: 'completed' }).eq('id', rentalId);
    await fetchAllTables();
  };

  // ยกเลิกรายการเช่า -> หากชำระเงินแล้วให้เปลี่ยนเป็น refunded
  const handleCancelRental = async (rentalId: string, payment?: any) => {
    if (!confirm('ยืนยันการยกเลิกรายการเช่านี้? (หากชำระเงินแล้ว ระบบจะเปลี่ยนสถานะเป็น Refunded)')) return;

    await supabase.from('rentals').update({ status: 'cancelled' }).eq('id', rentalId);
    if (payment && payment.status === 'paid') {
      await supabase.from('payments').update({ status: 'refunded' }).eq('id', payment.id);
    }
    await fetchAllTables();
  };

  // เพิ่มรถยนต์ใหม่พร้อมรูปภาพ
  const handleAddCar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brandModel || !licensePlate) return;

    const { error } = await supabase.from('cars').insert({
      brand_model: brandModel,
      license_plate: licensePlate,
      car_type: carType,
      daily_rate: Number(dailyRate),
      image_url: imageUrl.trim() || null,
      is_active: true,
    });

    if (error) {
      alert('ไม่สามารถเพิ่มรถได้: ' + error.message);
    } else {
      setBrandModel('');
      setLicensePlate('');
      setImageUrl('');
      await fetchAllTables();
    }
  };

  // แก้ไขลิงก์รูปภาพของรถ
  const handleEditCarImage = async (carId: string, currentUrl?: string | null) => {
    const input = prompt('วาง URL รูปภาพรถยนต์ใหม่ (หรือเว้นว่างเพื่อใช้รูปเริ่มต้น):', currentUrl || '');
    if (input === null) return;
    await supabase
      .from('cars')
      .update({ image_url: input.trim() || null })
      .eq('id', carId);
    await fetchAllTables();
  };

  // เปิด/ปิด สถานะพร้อมใช้งานของรถ
  const handleToggleCarActive = async (carId: string, currentActive: boolean) => {
    await supabase.from('cars').update({ is_active: !currentActive }).eq('id', carId);
    await fetchAllTables();
  };

  // แก้ไขราคาเช่าต่อวัน
  const handleEditCarRate = async (carId: string, currentRate: number) => {
    const input = prompt('ระบุอัตราค่าเช่าต่อวันใหม่ (บาท):', String(currentRate));
    if (!input || isNaN(Number(input))) return;
    await supabase.from('cars').update({ daily_rate: Number(input) }).eq('id', carId);
    await fetchAllTables();
  };

  // สลับสิทธิ์ผู้ใช้ customer <-> admin
  const handleToggleUserRole = async (userId: string, currentRole: string) => {
    const nextRole = currentRole === 'admin' ? 'customer' : 'admin';
    if (!confirm(`เปลี่ยนสิทธิ์ผู้ใช้นี้เป็น ${nextRole.toUpperCase()}?`)) return;
    await supabase.from('profiles').update({ role: nextRole }).eq('id', userId);
    await fetchAllTables();
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  // KPI Metrics
  const totalRevenue = payments
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const pendingCount = rentals.filter((r) => r.status === 'pending').length;
  const activeCarsCount = cars.filter((c) => c.is_active).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        กำลังตรวจสอบสิทธิ์ผู้ดูแลระบบ...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <span className="font-bold text-lg text-white">DriveEase Admin</span>
              <span className="hidden sm:inline text-xs text-amber-400 ml-2">Fleet & Operations</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchAllTables}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
              title="รีเฟรชข้อมูล"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
            >
              <LogOut className="w-4 h-4" />
              ออกจากระบบ
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
              <span>รายได้รวมที่ชำระแล้ว</span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-2xl font-bold text-emerald-400">฿{totalRevenue.toLocaleString()}</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
              <span>รายการรออนุมัติ (Pending)</span>
              <CalendarCheck className="w-4 h-4 text-amber-400" />
            </div>
            <p className="text-2xl font-bold text-amber-400">{pendingCount} รายการ</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
              <span>รถพร้อมให้บริการ</span>
              <Car className="w-4 h-4 text-blue-400" />
            </div>
            <p className="text-2xl font-bold text-white">
              {activeCarsCount} <span className="text-sm font-normal text-slate-500">/ {cars.length} คัน</span>
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
              <span>ผู้ใช้งานในระบบ</span>
              <Users className="w-4 h-4 text-purple-400" />
            </div>
            <p className="text-2xl font-bold text-white">{profiles.length} บัญชี</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-4">
          {[
            { id: 'rentals', label: 'จัดการรายการเช่า & ชำระเงิน', icon: CalendarCheck },
            { id: 'cars', label: 'จัดการรถเช่า (Fleet CRUD)', icon: Car },
            { id: 'users', label: 'จัดการสิทธิ์ผู้ใช้ (Roles)', icon: Users },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === tab.id
                    ? 'bg-amber-600 text-white'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* TAB 1: RENTALS & PAYMENTS */}
        {activeTab === 'rentals' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-950 text-slate-400 text-xs uppercase border-b border-slate-800">
                  <tr>
                    <th className="p-4">ลูกค้า</th>
                    <th className="p-4">รถยนต์</th>
                    <th className="p-4">วันที่รับ - คืน</th>
                    <th className="p-4">ยอดเงิน & ช่องทาง</th>
                    <th className="p-4">สถานะการเช่า / ชำระเงิน</th>
                    <th className="p-4 text-right">การจัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {rentals.map((r) => {
                    const payment = r.payments?.[0];
                    return (
                      <tr key={r.id} className="hover:bg-slate-800/40">
                        <td className="p-4">
                          <p className="font-semibold text-white">{r.profiles?.full_name}</p>
                          <p className="text-xs text-slate-400">{r.profiles?.phone}</p>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <img
                              src={r.cars?.image_url || DEFAULT_CAR_IMAGE}
                              alt={r.cars?.brand_model || 'Car'}
                              className="w-14 h-10 object-cover rounded-lg border border-slate-700 shrink-0"
                            />
                            <div>
                              <p className="font-medium text-slate-200">{r.cars?.brand_model}</p>
                              <p className="text-xs text-slate-400">{r.cars?.license_plate}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-xs text-slate-300">
                          <div>รับ: {r.pickup_date}</div>
                          <div>คืน: {r.return_date}</div>
                        </td>
                        <td className="p-4">
                          <p className="font-bold text-white">
                            ฿{Number(r.total_amount).toLocaleString()}
                          </p>
                          <p className="text-xs text-slate-400 uppercase">{payment?.method || '-'}</p>
                        </td>
                        <td className="p-4 space-y-1">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                              r.status === 'confirmed'
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : r.status === 'completed'
                                ? 'bg-blue-500/15 text-blue-400'
                                : r.status === 'cancelled'
                                ? 'bg-red-500/15 text-red-400'
                                : 'bg-amber-500/15 text-amber-400'
                            }`}
                          >
                            Rental: {r.status}
                          </span>
                          <br />
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                              payment?.status === 'paid'
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : payment?.status === 'refunded'
                                ? 'bg-purple-500/15 text-purple-400'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            Payment: {payment?.status || 'unpaid'}
                          </span>
                        </td>
                        <td className="p-4 text-right space-x-2">
                          {r.status !== 'cancelled' && payment?.status !== 'paid' && (
                            <button
                              onClick={() => handleConfirmPayment(r.id, payment?.id)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium inline-flex items-center gap-1"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              ยืนยันรับเงิน
                            </button>
                          )}
                          {r.status === 'confirmed' && (
                            <button
                              onClick={() => handleCompleteRental(r.id)}
                              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium"
                            >
                              คืนรถสำเร็จ
                            </button>
                          )}
                          {r.status !== 'cancelled' && r.status !== 'completed' && (
                            <button
                              onClick={() => handleCancelRental(r.id, payment)}
                              className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium inline-flex items-center gap-1"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              ยกเลิก
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: CAR FLEET CRUD */}
        {activeTab === 'cars' && (
          <div className="space-y-6">
            {/* Add Car Form */}
            <form
              onSubmit={handleAddCar}
              className="bg-slate-900 border border-slate-800 p-5 rounded-2xl grid grid-cols-1 sm:grid-cols-6 gap-3 items-end"
            >
              <div className="sm:col-span-2">
                <label className="block text-xs text-slate-400 mb-1">ยี่ห้อ / รุ่นรถยนต์</label>
                <input
                  type="text"
                  required
                  placeholder="เช่น Toyota Camry 2.5 Hybrid"
                  value={brandModel}
                  onChange={(e) => setBrandModel(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">ทะเบียนรถ</label>
                <input
                  type="text"
                  required
                  placeholder="1กข-9999 กทม"
                  value={licensePlate}
                  onChange={(e) => setLicensePlate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">ประเภท / ราคาต่อวัน</label>
                <div className="flex gap-1.5">
                  <select
                    value={carType}
                    onChange={(e) => setCarType(e.target.value)}
                    className="px-2 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                  >
                    <option value="Sedan">Sedan</option>
                    <option value="SUV">SUV</option>
                    <option value="Pickup">Pickup</option>
                    <option value="Van">Van</option>
                    <option value="EV">EV</option>
                  </select>
                  <input
                    type="number"
                    required
                    min={0}
                    value={dailyRate}
                    onChange={(e) => setDailyRate(e.target.value)}
                    className="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">ลิงก์รูปภาพ (URL)</label>
                <input
                  type="url"
                  placeholder="https://... หรือ /cars/camry.jpg"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white"
                />
              </div>
              <button
                type="submit"
                className="py-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                เพิ่มรถยนต์
              </button>
            </form>

            {/* Car List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {cars.map((car) => (
                <div
                  key={car.id}
                  className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    <img
                      src={car.image_url || DEFAULT_CAR_IMAGE}
                      alt={car.brand_model}
                      className="w-full h-40 object-cover border-b border-slate-800"
                    />
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs px-2.5 py-0.5 rounded bg-slate-800 text-slate-300">
                          {car.car_type}
                        </span>
                        <span
                          className={`text-xs font-semibold ${
                            car.is_active ? 'text-emerald-400' : 'text-red-400'
                          }`}
                        >
                          {car.is_active ? '● เปิดให้เช่า' : '● ปิดซ่อมบำรุง'}
                        </span>
                      </div>
                      <h3 className="font-bold text-white">{car.brand_model}</h3>
                      <p className="text-xs text-slate-400 mt-0.5">ทะเบียน: {car.license_plate}</p>
                      <p className="text-lg font-bold text-blue-400 mt-3">
                        ฿{Number(car.daily_rate).toLocaleString()} / วัน
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2 px-5 pb-5 pt-3 border-t border-slate-800">
                    <button
                      onClick={() => handleEditCarImage(car.id, car.image_url)}
                      className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 flex items-center justify-center gap-1"
                      title="เปลี่ยนรูปภาพรถ"
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      รูป
                    </button>
                    <button
                      onClick={() => handleEditCarRate(car.id, car.daily_rate)}
                      className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 flex items-center justify-center gap-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      แก้ราคา
                    </button>
                    <button
                      onClick={() => handleToggleCarActive(car.id, car.is_active)}
                      className={`flex-1 py-2 rounded-xl text-xs font-medium ${
                        car.is_active
                          ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                      }`}
                    >
                      {car.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: USER ROLE MANAGEMENT */}
        {activeTab === 'users' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-950 text-slate-400 text-xs uppercase border-b border-slate-800">
                <tr>
                  <th className="p-4">ชื่อ-นามสกุล</th>
                  <th className="p-4">เบอร์โทร</th>
                  <th className="p-4">สิทธิ์ปัจจุบัน (Role)</th>
                  <th className="p-4 text-right">เปลี่ยนสิทธิ์</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {profiles.map((u) => (
                  <tr key={u.id}>
                    <td className="p-4 font-medium text-white">{u.full_name}</td>
                    <td className="p-4 text-slate-400">{u.phone || '-'}</td>
                    <td className="p-4">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          u.role === 'admin'
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-blue-500/20 text-blue-400'
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => handleToggleUserRole(u.id, u.role)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200"
                      >
                        สลับเป็น {u.role === 'admin' ? 'Customer' : 'Admin'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
