# /// script
# requires-python = ">=3.12"
# dependencies = [
#   "jmcomic",
#   "img2pdf"
# ]
# ///

import os
import sys
import jmcomic

album_id = sys.argv[1]
config_path = os.path.join(os.path.dirname(__file__), "option.yml")
jmOption = jmcomic.create_option_by_file(config_path)

jmOption.download_album(album_id)
