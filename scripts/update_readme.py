#!/usr/bin/env python3
import os
import json
import re


def load_users_index(data_dir: str = 'docs/data') -> dict:
    index_file = os.path.join(data_dir, 'users_index.json')
    if not os.path.exists(index_file):
        raise FileNotFoundError(f"users_index.json not found: {index_file}")
    
    with open(index_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    users = data.get('users', [])
    if not users:
        raise ValueError("No users found in users_index.json")
    
    return users[0]


def update_readme(user_data: dict, readme_path: str = 'README.md'):
    if not os.path.exists(readme_path):
        raise FileNotFoundError(f"README.md not found: {readme_path}")
    
    with open(readme_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    lines = content.split('\n')
    
    latest_video = user_data.get('latest_video', {})
    latest_date = latest_video.get('date', '')
    latest_title = latest_video.get('title', '')
    
    total_videos = user_data.get('total_videos', 0)
    total_comments = user_data.get('total_comments', 0)
    author_replies = user_data.get('author_replies', 0)
    participants_count = user_data.get('participants_count', 0)
    
    new_line_2 = f"**📌 {latest_date} **：{latest_title}"
    if lines[1].startswith('**📌'):
        lines[1] = new_line_2
    
    for i, line in enumerate(lines):
        if line.startswith('- **发表了**：'):
            lines[i] = f"- **发表了**：🎬 **{total_videos} 个作品** | **她回复了**：💬 **{author_replies} 条评论**"
        elif line.startswith('- **账号累计评论**：'):
            lines[i] = f"- **账号累计评论**：💬 **{total_comments} 条** | **累计参与人数**：👥 **{participants_count} 个**"
    
    updated_content = '\n'.join(lines)
    
    with open(readme_path, 'w', encoding='utf-8') as f:
        f.write(updated_content)
    
    print(f"README.md 已更新:")
    print(f"  - 最新作品: {latest_date} - {latest_title[:50]}...")
    print(f"  - 作品总数: {total_videos}")
    print(f"  - 作者回复: {author_replies}")
    print(f"  - 累计评论: {total_comments}")
    print(f"  - 参与人数: {participants_count}")


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(script_dir)
    
    os.chdir(project_dir)
    
    user_data = load_users_index()
    update_readme(user_data)


if __name__ == '__main__':
    main()
