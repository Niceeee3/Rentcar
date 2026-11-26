'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/app/lib/supabase';
import { Car, ShieldCheck, User, Mail, Lock, Phone, AlertCircle, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [portal, setPortal] = useState<'customer' | 'admin'>('customer');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');

  const handlePortalSwitch = (target: 'customer' | 'admin') => {
    setPortal(target);
    setIsSignUp(false);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (portal === 'customer' && isSignUp) {
        // 1. สมัครสมาชิกใหม่ (Customer เท่านั้น)
        const { data: authData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) throw signUpError;
        if (!authData.user) throw new Error('ไม่สามารถสร้างบัญชีผู้ใช้ได้');

        // 2. Upsert ข้อมูลลงตาราง profiles
        const { error: profileError } = await supabase.from('profiles').upsert({
          id: authData.user.id,
          full_name: fullName || email.split('@')[0],
          phone: phone || '-',
          role: 'customer',
        });
        if (profileError) throw profileError;

        router.push('/');
      } else {
        // เข้าสู่ระบบ (ทั้ง Customer และ Admin)
        const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
        if (!authData.user) throw new Error('ไม่พบข้อมูลผู้ใช้งาน');

        // ตรวจสอบสิทธิ์ในตาราง profiles
        const { data: profile, error: profileFetchError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authData.user.id)
          .single();

        if (profileFetchError && profileFetchError.code !== 'PGRST116') {
          throw profileFetchError;
        }

        // กรณียังไม่มี row ใน profiles ให้สร้างอัตโนมัติ
        let userRole = profile?.role;
        if (!profile) {
          const { error: insertErr } = await supabase.from('profiles').insert({
            id: authData.user.id,
            full_name: authData.user.email?.split('@')[0] || 'User',
            role: 'customer',
          });
          if (insertErr) throw insertErr;
          userRole = 'customer';
        }

        if (portal === 'admin') {
          if (userRole !== 'admin') {
            await supabase.auth.signOut();
            throw new Error('บัญชีนี้ไม่มีสิทธิ์เข้าใช้งานส่วนผู้ดูแลระบบ (Admin Only)');
          }
          router.push('/admin');
        } else {
          router.push(userRole === 'admin' ? '/admin' : '/');
        }
      }
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 text-center border-b border-slate-800 bg-gradient-to-b from-slate-800/50 to-transparent">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600/20 text-blue-400 mb-3 border border-blue-500/30">
            <Car className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">DriveEase Car Rental</h1>
          <p className="text-sm text-slate-400 mt-1">ระบบจองเช่ารถยนต์ออนไลน์ครบวงจร</p>
        </div>

        {/* Portal Switcher */}
        <div className="grid grid-cols-2 p-1.5 bg-slate-950/60 mx-6 mt-6 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => handlePortalSwitch('customer')}
            className={`flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${
              portal === 'customer'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <User className="w-4 h-4" />
            ลูกค้า (Customer)
          </button>
          <button
            type="button"
            onClick={() => handlePortalSwitch('admin')}
            className={`flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${
              portal === 'admin'
                ? 'bg-amber-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            ผู้ดูแล (Admin)
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {portal === 'customer' && isSignUp && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">ชื่อ-นามสกุล</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="สมชาย ใจดี"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">เบอร์โทรศัพท์</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="081-234-5678"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">อีเมล</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">รหัสผ่าน</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-2.5 px-4 rounded-xl font-medium text-white text-sm flex items-center justify-center gap-2 transition-all ${
              portal === 'admin'
                ? 'bg-amber-600 hover:bg-amber-500'
                : 'bg-blue-600 hover:bg-blue-500'
            } disabled:opacity-50`}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {portal === 'admin'
              ? 'เข้าสู่ระบบผู้ดูแล'
              : isSignUp
              ? 'สมัครสมาชิก'
              : 'เข้าสู่ระบบ'}
          </button>

          {portal === 'customer' && (
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError(null);
                }}
                className="text-xs text-slate-400 hover:text-blue-400 transition-colors"
              >
                {isSignUp
                  ? 'มีบัญชีอยู่แล้ว? เข้าสู่ระบบที่นี่'
                  : 'ยังไม่มีบัญชี? สมัครสมาชิกใหม่'}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
