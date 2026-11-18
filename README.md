# 🚀 Bot Projects Portfolio

Yuzu bot と Kedo bot の開発プロジェクト・Webアプリ・自動化システムを一元管理・閲覧するポートフォリオシステム（Firebase Firestore 連携版）。

## ✨ 主な特徴

- **統一された閲覧保護**: ルート（`index.html`）と `portfolio.html` の両方で同一の閲覧ロック（SHA-256ハッシュ照合・セッション保持対応）を提供
- **スマートフォン完全対応**:
  - 横スワイプ対応の省スペース1行カテゴリーバー（画面占有を解消）
  - LINE / Instagram / Slack 等のアプリ内ブラウザ検知＆標準ブラウザ誘導バナー
  - GoogleマルチアカウントURL（`/u/0/` 等）や二重貼り付けURLの自動正規化
  - GAS・学内ドメイン限定・検証サンドボックス等の利用条件バッジと詳細モーダル案内
- **高速な検索・多軸フィルタリング**:
  - キーワード・番号・タグ即時検索
  - 作成者（Yuzu bot / Kedo bot / 共同制作）・基盤（GAS / Cloudflare / Vercel 等）・並び順切替
  - PC向け2列カード / 1列リスト切替、管理用リンク（`Sheet` / `Edit`）表示トグル
- **総合管理画面（`admin.html`）**:
  - プロジェクト・カテゴリー・プラットフォームのリアルタイム追加・編集・削除
  - PCドラッグ＆ドロップおよびスマホ対応の `↑` / `↓` 並び替え
  - データベース品質診断・一括URL修復機能＆JSONバックアップ出力

## 📁 ファイル構成

```text
bot-portfolio/
├── index.html           # ポートフォリオ画面（ルートURL用・ロック付き）
├── portfolio.html       # ポートフォリオ画面（既存ブックマーク互換・ロック付き）
├── admin.html           # 総合管理画面
├── portfolio-app.js     # ポートフォリオ画面ロジック
├── admin-app.js         # 管理画面ロジック
├── portfolio-shared.js  # 共通設定・SHA-256認証・URL正規化・XSS対策ヘルパー
├── styles.css           # 共通スタイルシート（PC・スマホレスポンシブ対応）
└── README.md            # ドキュメント
```

## 🔐 セキュリティ運用メモ

- ソースコード上には平文パスワードを保持せず、`portfolio-shared.js` 内の `PASSWORD_SHA256`（SHA-256ハッシュ値）で照合しています。
- さらに強固なアクセス制御が必要な場合は、**Cloudflare Pages + Cloudflare Access（Zero Trust）** および **Firebase Authentication + Firestore Security Rules** の併用を推奨します。
