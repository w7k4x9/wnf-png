# WNF PNG 변환기 — 폰트 연결판

## GitHub 루트 구조

```text
api/
  png.js
fontconfig/
  fonts.conf
  Pretendard-Regular.otf       # 또는 pretendard-Regular.otf
  Pretendard-Bold.otf          # 또는 pretendard-Bold.otf
  songam_leehyungsik.ttf
  KimjungchulScript-Regular.ttf
  Griun_OMIRI-Rg.ttf
package.json
UPDATE.md
vercel.json
```

`PUT_FONTS_HERE.txt`는 안내용이므로 배포 후 남겨도 되고 지워도 됩니다.

## 폰트 적용 규칙

- 모든 기본 UI: Pretendard
- `/일기` 본문 `.hw`
  - `c=1` 또는 백시현/시현 경로: `KimjungchulScript-Regular.ttf`
  - `c=2` 또는 이안 경로: `songam_leehyungsik.ttf`
  - `c=3` 또는 차태윤/태윤 경로: `Griun_OMIRI-Rg.ttf`
- `/편지`의 수신자·본문·발신자 `.rcp/.lt/.frm`
  - `w=백시현`: 백시현 필체
  - `w=이안`: 이안 필체
  - `w=차태윤`: 차태윤 필체
- 캐릭터를 판별하지 못하면 Pretendard로 안전 폴백합니다.

폰트 파일 내부 family 이름이 무엇이든 `fonts.conf`가 파일명 기준으로
`WNF Pretendard`, `WNF Sihyun Script`, `WNF Ian Script`,
`WNF Taeyun Script`로 다시 등록합니다.

## 배포

1. 위 구조를 GitHub 저장소 루트에 올립니다.
2. Vercel에서 해당 저장소를 Import합니다.
3. Framework Preset은 `Other`로 둡니다.
4. 별도 Build Command와 Output Directory는 입력하지 않습니다.
5. 배포가 끝난 뒤 아래 주소를 엽니다.

```text
https://프로젝트명.vercel.app/api/png
```

정상이면 `fonts` 항목이 모두 `ready`여야 합니다.

```json
{
  "fontConfig": "ready",
  "fonts": {
    "pretendardRegular": { "status": "ready" },
    "pretendardBold": { "status": "ready" },
    "ian": { "status": "ready" },
    "sihyun": { "status": "ready" },
    "taeyun": { "status": "ready" }
  }
}
```

`git_lfs_pointer`가 뜨면 실제 폰트가 아니라 Git LFS 안내 텍스트만 배포된 것입니다.

## Cloudflare Worker 연결

WNF Worker의 변수에 다음 값을 넣습니다.

```text
WNF_RASTER_PNG=https://프로젝트명.vercel.app
```

워커 코드가 `/api/png?u=`를 자동으로 붙입니다.

## 테스트

원본 SVG 확인:

```text
https://sj1.uk/일기?c=2&t=테스트&m=2,이안의_글씨입니다&svg=1
```

PNG 변환 확인:

```text
https://프로젝트명.vercel.app/api/png?u=https%3A%2F%2Fsj1.uk%2F일기%3Fc%3D2%26t%3D테스트%26m%3D2%2C이안의_글씨입니다%26svg%3D1
```

응답 헤더 예:

```text
Content-Type: image/png
X-WNF-Font: WNF Ian Script
X-WNF-Route: diary
```

캐시된 이전 결과가 보이면 원본 주소에 `&v=2`, `&v=3`처럼 새 버전 값을 붙이세요.
