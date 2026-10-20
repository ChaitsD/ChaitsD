# Supplied MAYGREY logo assets

The header and footer now support separate, original PNG assets. No replacement artwork has been generated.

- Save the first horizontal MAYGREY logo as `public/media/maygrey-header.png`.
- Save the second stacked MAY / GREY image with the tagline as `public/media/maygrey-footer.png`.

Use the original PNG files; renaming a JPEG extension to `.png` does not convert it. The first square image is displayed through a horizontal window centered on the wordmark so its large top/bottom whitespace does not enlarge the navigation. The footer image is shown in full without cropping, inversion or distortion.

The original uploaded files are now installed at those paths. The black footer artwork is presented on a bone background for contrast. If either asset is removed, the existing text logo remains in place. Missing image files never produce broken image icons. After adding assets, restart local development or refresh the site. Production builds must be rebuilt with `npm run build`.

To upload on GitHub: open the repository's `public/media` folder, choose **Add file → Upload files**, and upload the two PNGs using these exact filenames. Commit the upload, then download the updated repository or pull it locally.
