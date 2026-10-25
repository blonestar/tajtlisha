import { protocol } from 'electron';
import { createMediaResponse } from './media-response';
import { MediaTokenMap } from './media-token-map';

export const LOCAL_MEDIA_SCHEME = 'tajtlisha-media';

protocol.registerSchemesAsPrivileged([
  {
    scheme: LOCAL_MEDIA_SCHEME,
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      stream: true
    }
  }
]);

export type LocalMediaProtocol = {
  /** Must run once, after app ready and before any URL is handed to a renderer. */
  register(): Promise<void>;
  createVideoUrl(inputPath: string): string;
  revoke(inputPath: string): void;
};

export function createLocalMediaProtocol(): LocalMediaProtocol {
  const tokens = new MediaTokenMap();

  return {
    register: async () => {
      protocol.handle(LOCAL_MEDIA_SCHEME, async (request) => {
        const requestUrl = new URL(request.url);
        const token = requestUrl.pathname.slice(1);
        const inputPath = tokens.pathFor(token);

        if (requestUrl.hostname !== 'video' || inputPath === undefined) {
          return new Response('Media not found.', { status: 404 });
        }

        // Range requests must get 206 answers, or the video cannot seek.
        return createMediaResponse(inputPath, request.headers.get('range'));
      });
    },
    createVideoUrl: (inputPath) => `${LOCAL_MEDIA_SCHEME}://video/${tokens.tokenFor(inputPath)}`,
    revoke: (inputPath) => tokens.revoke(inputPath)
  };
}
