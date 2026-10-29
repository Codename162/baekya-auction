import React, { useEffect, useState } from 'react';
import { BadgeCheck, Image, Save, UserRound } from 'lucide-react';

export default function AccountSettings({ supabase, session, profile, onSaved }) {
  const [name, setName] = useState(profile?.discord_username || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setName(profile?.discord_username || '');
    setAvatarUrl(profile?.avatar_url || '');
  }, [profile?.discord_username, profile?.avatar_url]);

  async function save(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    const cleanName = name.trim();
    const cleanAvatar = avatarUrl.trim();
    if (cleanName.length < 2 || cleanName.length > 32) {
      setError('표시 이름은 2~32자로 입력해 주세요.');
      return;
    }
    if (cleanAvatar) {
      try {
        const parsed = new URL(cleanAvatar);
        if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error();
      } catch (_) {
        setError('프로필 사진 주소는 http:// 또는 https:// 주소로 입력해 주세요.');
        return;
      }
    }
    if (!session?.user?.id) {
      setError('로그인 상태를 확인한 뒤 다시 시도해 주세요.');
      return;
    }
    setBusy(true);
    try {
      const { data, error: updateError } = await supabase
        .from('profiles')
        .update({ discord_username: cleanName, avatar_url: cleanAvatar || null })
        .eq('id', session.user.id)
        .select('id,discord_username,avatar_url')
        .single();
      if (updateError) throw updateError;
      setName(data.discord_username || '');
      setAvatarUrl(data.avatar_url || '');
      setNotice('내 프로필이 저장되었습니다.');
      await onSaved?.();
    } catch (e) {
      setError(e.message || '프로필 저장에 실패했습니다. 데이터베이스 권한 설정을 확인해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="account-settings">
    <div className="panel">
      <div className="panelhead"><div><p className="eyebrow">MY ACCOUNT</p><h3><UserRound size={19} style={{verticalAlign:'-4px',marginRight:8}}/>내 프로필 수정</h3><p className="tiny">변경 내용은 사이트의 계정 표시와 선수 프로필에 반영됩니다. 계정 권한은 변경되지 않습니다.</p></div></div>
      {error && <div className="alert" role="alert">{error}</div>}
      {notice && <div className="success" role="status"><BadgeCheck size={16} style={{verticalAlign:'-3px',marginRight:6}}/>{notice}</div>}
      <form className="adminform" onSubmit={save}>
        <div className="account-profile-preview">
          {avatarUrl.trim() ? <img src={avatarUrl.trim()} alt="프로필 미리보기" onError={e=>{e.currentTarget.style.display='none';}} /> : <span><UserRound size={30}/></span>}
          <div><strong>{name.trim() || '표시 이름'}</strong><small>{session?.user?.email || 'Discord 계정으로 로그인됨'}</small></div>
        </div>
        <label className="field">표시 이름<input value={name} onChange={e=>setName(e.target.value)} minLength={2} maxLength={32} placeholder="사이트에 표시할 이름" required /></label>
        <label className="field">프로필 사진 URL <span className="tiny">(선택 사항)</span><input type="url" value={avatarUrl} onChange={e=>setAvatarUrl(e.target.value)} placeholder="https://example.com/avatar.png" /></label>
        <p className="tiny"><Image size={14} style={{verticalAlign:'-3px',marginRight:5}}/>이미지 주소를 비워 두면 기본 프로필 아이콘이 표시됩니다. Discord 로그인 계정 자체의 이름이나 사진은 변경되지 않습니다.</p>
        <button type="submit" className="btn primary" disabled={busy}><Save size={16}/>{busy ? '저장 중…' : '프로필 저장'}</button>
      </form>
    </div>
  </section>;
}
