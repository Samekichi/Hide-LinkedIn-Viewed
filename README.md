# Hide LinkedIn Viewed Jobs

[中文](README.zh-CN.md)

A small Edge / Chrome extension that hides jobs marked as `Viewed` in LinkedIn job lists.

## Features

- Automatically hides viewed jobs
- Saves the preference locally
- Temporarily restores viewed jobs in the current tab
- Keeps a newly opened job visible until the next page refresh
- Supports both `li[data-occludable-job-id]` and `componentkey` button cards
- Does not collect or transmit user data

## Install

1. Open `edge://extensions` or `chrome://extensions`
2. Enable developer mode
3. Select **Load unpacked**
4. Choose this project folder
5. Open / refresh `https://www.linkedin.com/jobs/`

## Limitations

The extension selects whole cards using two observed layouts and matches exact
status text. LinkedIn layout changes may still require selector updates.

## Disclaimer

This independent project is not affiliated with, endorsed by, or sponsored by LinkedIn Corporation.

## License

[MIT](LICENSE)
