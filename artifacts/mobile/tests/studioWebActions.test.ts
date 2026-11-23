import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getStudioWebMapsUrl,
  openStudioWebFilePicker,
  openStudioWebMapsLocation,
} from '@/services/studioWebActions';

test('Studio web Maps opens only a validated HTTPS target synchronously in a new tab', () => {
  const opened: Array<[string, string | undefined, string | undefined]> = [];
  const openWindow = (url: string, target?: string, features?: string) => {
    opened.push([url, target, features]);
  };
  const pasted = 'https://maps.google.com/?q=29.3759,47.9774';
  assert.equal(getStudioWebMapsUrl(pasted, 'Salmiya'), pasted);
  assert.equal(
    getStudioWebMapsUrl('', 'Salmiya, Kuwait'),
    'https://www.google.com/maps/search/?api=1&query=Salmiya%2C%20Kuwait',
  );
  assert.throws(() => getStudioWebMapsUrl('https://evil.example/maps', 'Salmiya'), /INVALID_LOCATION_LINK/);

  openStudioWebMapsLocation({ link: pasted, query: 'Salmiya' }, openWindow);
  assert.deepEqual(opened, [[pasted, '_blank', 'noopener,noreferrer']]);
  assert.equal(opened.some(([url]) => url.startsWith('comgooglemaps:')), false);
});

test('Studio web media and PDF pickers attach the input before synchronously opening it', () => {
  const runPicker = (accept: string) => {
    let clickCount = 0;
    let removed = false;
    let appended = false;
    let changeHandler: EventListener | undefined;
    let cancelHandler: EventListener | undefined;
    let selected: readonly File[] = [];
    const file = { name: 'studio-upload' } as File;
    const input = {
      accept: '',
      files: [file] as unknown as FileList,
      multiple: false,
      tabIndex: 0,
      style: {} as CSSStyleDeclaration,
      setAttribute: () => undefined,
      addEventListener: (type: string, listener: EventListener) => {
        if (type === 'change') changeHandler = listener;
        if (type === 'cancel') cancelHandler = listener;
      },
      click: () => {
        assert.equal(appended, true, 'browser file dialogs require a connected input');
        clickCount += 1;
      },
      remove: () => { removed = true; },
    } as unknown as HTMLInputElement;
    const documentObject = {
      createElement: (tagName: string) => {
        assert.equal(tagName, 'input');
        return input;
      },
      body: { appendChild: () => { appended = true; } },
    } as unknown as Document;

    openStudioWebFilePicker({
      accept,
      onFiles: files => { selected = files; },
    }, documentObject);

    assert.equal(input.accept, accept);
    assert.equal(input.multiple, true);
    assert.equal(clickCount, 1);
    changeHandler?.(new Event('change'));
    assert.deepEqual(selected, [file]);
    assert.equal(removed, true);
    assert.ok(cancelHandler);
  };

  runPicker('image/*,video/*');
  runPicker('application/pdf');
});

test('Studio web picker cancellation removes its temporary input', () => {
  let removed = false;
  let cancelHandler: EventListener | undefined;
  const input = {
    files: null,
    style: {} as CSSStyleDeclaration,
    setAttribute: () => undefined,
    addEventListener: (type: string, listener: EventListener) => {
      if (type === 'cancel') cancelHandler = listener;
    },
    click: () => undefined,
    remove: () => { removed = true; },
  } as unknown as HTMLInputElement;
  const documentObject = {
    createElement: () => input,
    body: { appendChild: () => undefined },
  } as unknown as Document;

  openStudioWebFilePicker({ accept: 'image/*', onFiles: () => assert.fail('cancel must not select files') }, documentObject);
  cancelHandler?.(new Event('cancel'));
  assert.equal(removed, true);
});